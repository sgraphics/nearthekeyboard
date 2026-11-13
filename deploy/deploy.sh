#!/usr/bin/env bash
# Server-side deploy of NTK (ntk.tools). Run as root on the server.
#
# The app lives in /opt/ntk, owned by the system user `ntk`. Nothing is built:
# nginx serves /opt/ntk/web as it is, and the relay (relay/server.mjs, Node 20+,
# no dependencies) runs as ntk-relay.service. Its secrets live outside git in
# /opt/ntk/.env (mode 600): NTK_API, NTK_PROJECT, NTK_PAYMENT_KEY, optionally
# KEEP_WARM_SEC and the RATE_* limits (see relay/server.mjs).
#
# While the GitHub repository is private the server cannot pull. Push from a
# development machine instead; NO_PULL=1 fast-forwards main to the pushed branch:
#   ssh root@<server> 'git init -q /opt/ntk'                      # once
#   git push root@<server>:/opt/ntk main:refs/heads/incoming
#   ssh root@<server> 'cd /opt/ntk && NO_PULL=1 bash deploy/deploy.sh'
# The first time, the working tree is still empty, so run the pushed copy:
#   ssh root@<server> 'git -C /opt/ntk show incoming:deploy/deploy.sh | NO_PULL=1 bash'
#
# The server runs another live site. This script only adds NTK's own files (the
# unit ntk-relay.service, the nginx site ntk.conf), restarts only the NTK relay,
# runs `nginx -t` before `systemctl reload nginx`, never restarts nginx, and
# never touches the other site's files, services or certificates.
set -euo pipefail

APP=/opt/ntk
REPO=${NTK_REPO:-https://github.com/sgraphics/nearthekeyboard.git}
DOMAIN=ntk.tools
CERT=/etc/letsencrypt/live/$DOMAIN/fullchain.pem
ACME_ROOT=/var/www/letsencrypt
PORT=3970

say() { printf '== %s\n' "$*"; }
die() { printf '!! %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "run as root"
command -v node >/dev/null || die "node is not installed (Node 20 or later is needed)"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)' \
  || die "Node 20 or later is needed, found $(node --version)"
command -v nginx >/dev/null || die "nginx is not installed"

id ntk >/dev/null 2>&1 || useradd --system --home-dir "$APP" --shell /usr/sbin/nologin ntk

# git runs as root on a tree that belongs to ntk
git config --global --get-all safe.directory 2>/dev/null | grep -qxF "$APP" \
  || git config --global --add safe.directory "$APP"

# ---- code ----------------------------------------------------------------
if [ ! -d "$APP/.git" ]; then
  [ "${NO_PULL:-}" = 1 ] && die "$APP is not a git repository: git init it and push first (see the top of this script)"
  git clone --quiet "$REPO" "$APP"
fi
cd "$APP"
if [ "${NO_PULL:-}" = 1 ]; then
  git rev-parse --verify --quiet refs/heads/incoming >/dev/null || die "no branch 'incoming': push it first"
  if git rev-parse --verify --quiet refs/heads/main >/dev/null; then
    git checkout --quiet main
    git merge --ff-only --quiet incoming
  else
    git checkout --quiet -B main incoming   # first deploy: main starts at the pushed commit
  fi
else
  git checkout --quiet main
  git pull --ff-only --quiet origin main
fi
say "at $(git log -1 --format='%h %s')"
[ -f web/index.html ] && [ -f relay/server.mjs ] || die "web/index.html or relay/server.mjs is missing at this commit"

chown -R ntk:ntk "$APP"
[ -f "$APP/.env" ] && chmod 600 "$APP/.env"

# ---- the relay -----------------------------------------------------------
install -m 644 deploy/ntk-relay.service /etc/systemd/system/ntk-relay.service
systemctl daemon-reload
if [ -f "$APP/.env" ]; then
  systemctl enable --quiet ntk-relay
  systemctl restart ntk-relay
  say "ntk-relay restarted"
else
  cat <<EOF
!! $APP/.env is missing, so the relay is not started (the static site still is).
   Create it, mode 600, with:
     NTK_API=https://testnet-api.outlayer.ai
     NTK_PROJECT=nearthekeyboard.testnet/ntk
     NTK_PAYMENT_KEY=<the project owner's OutLayer payment key>
     KEEP_WARM_SEC=0        # e.g. 300 while recording the demo
   then run this script again.
EOF
fi

# ---- nginx: our own site file, HTTP only until the certificate exists ----
if [ -d /etc/nginx/sites-available ] && [ -d /etc/nginx/sites-enabled ]; then
  SITE=/etc/nginx/sites-available/ntk.conf
  LINK=/etc/nginx/sites-enabled/ntk.conf
else
  SITE=/etc/nginx/conf.d/ntk.conf
  LINK=
fi
mkdir -p "$ACME_ROOT"
new=$(mktemp)
old=$(mktemp)
trap 'rm -f "$new" "$old"' EXIT
if [ -f "$CERT" ]; then
  TLS=1
  cp deploy/nginx/ntk.conf "$new"
else
  TLS=0
  sed '/# tls$/d' deploy/nginx/ntk.conf > "$new"
fi
had_old=0
if [ -f "$SITE" ]; then cp -p "$SITE" "$old"; had_old=1; fi
link_was_there=0
if [ -n "$LINK" ] && [ -e "$LINK" ]; then link_was_there=1; fi

if [ "$had_old" = 1 ] && cmp -s "$new" "$SITE" && { [ -z "$LINK" ] || [ "$link_was_there" = 1 ]; }; then
  say "nginx: ntk.conf unchanged, no reload"
else
  install -m 644 "$new" "$SITE"
  [ -n "$LINK" ] && ln -sfn "$SITE" "$LINK"
  if nginx -t; then
    systemctl reload nginx
    say "nginx: ntk.conf installed ($([ "$TLS" = 1 ] && echo "HTTP and TLS" || echo "HTTP only")), nginx reloaded"
  else
    if [ "$had_old" = 1 ]; then
      install -m 644 "$old" "$SITE"
    else
      rm -f "$SITE"
      [ -n "$LINK" ] && [ "$link_was_there" = 0 ] && rm -f "$LINK"
    fi
    die "nginx -t failed: the previous ntk.conf is back in place and nginx was not reloaded"
  fi
fi

if [ "$TLS" = 0 ]; then
  cat <<EOF

== No certificate for $DOMAIN yet: the site answers on port 80 only.
   When DNS for $DOMAIN and www.$DOMAIN points at this server:
     certbot certonly --webroot -w $ACME_ROOT -d $DOMAIN -d www.$DOMAIN --cert-name $DOMAIN --deploy-hook 'systemctl reload nginx'
   If the domain is proxied by Cloudflare with "Always Use HTTPS", HTTP-01 may not get
   through; get it by DNS-01 instead, the way the other site's certificate was made:
     certbot certonly --dns-cloudflare --dns-cloudflare-credentials <its Cloudflare credentials file> -d $DOMAIN -d www.$DOMAIN --cert-name $DOMAIN
   Then run this script again: it adds TLS on port 4443.
   Check that the SNI proxy on port 443 sends $DOMAIN to 4443. Its map is part of the
   shared nginx stream configuration, which this script does not edit.
EOF
fi

# ---- checks ----------------------------------------------------------------
sleep 2
if [ -f "$APP/.env" ]; then
  systemctl --no-pager --lines=5 status ntk-relay | head -12 || true
fi
# /api/info holds a request up to 20 s while the relay first asks the enclave, then answers 503.
check() { curl -s -m 25 -o /dev/null -w "$1 -> %{http_code}\n" "${@:2}" || echo "$1 -> no answer"; }
check "relay  /api/info   " "http://127.0.0.1:$PORT/api/info"
check "nginx  /           " -H "Host: $DOMAIN" "http://127.0.0.1/"
check "nginx  /e65ee28db5 " -H "Host: $DOMAIN" "http://127.0.0.1/e65ee28db5"
check "nginx  /feed/      " -H "Host: $DOMAIN" "http://127.0.0.1/feed/"
check "nginx  /api/info   " -H "Host: $DOMAIN" "http://127.0.0.1/api/info"
say "now check that the other site on this server still answers"

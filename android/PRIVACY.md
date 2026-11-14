# NTK keyboard: privacy

NTK is built on Simple Keyboard, which stores no data. NTK adds one thing that
leaves the phone, and only when you ask for it.

- While you type in a text field, the keyboard keeps in memory, per key tap:
  which key, how long it was held, the time to the next key, and where on the
  key your finger landed. Password fields and fields that ask for no learning
  (incognito) are never recorded. The recording is dropped when you leave the
  field.
- When you tap **Enroll** or **Sign**, that one session is sealed on the phone
  to the NTK enclave's key (NEAR OutLayer, Intel TDX) and sent with a signature
  by your NEAR account's key. Only code inside the enclave can open it. Your
  typing fingerprint is kept there, sealed; no fingerprint data comes back.
- A stamp, when you get one, is public: it names your NEAR account, the hash of
  the stamped text and its length, the tap count and the scores. It never
  contains the text.
- The relay and OutLayer see your account name, the operation and the time of
  each request, not the typing.
- Your account's key is stored on the phone, encrypted with an Android Keystore
  key. Log out deletes it. "Delete my fingerprint" deletes the fingerprint in
  the enclave.
- **Stamp buttons in other apps** are off until you switch on the accessibility
  service "NTK stamp buttons". When on, it reads the text on your screen, on
  the phone, only to find tags like `[NTK e65ee28db5]`, and draws a button over
  each one. It stores nothing, logs no screen text and sends nothing. When you
  tap a button, your browser opens `https://ntk.tools/<id>#t=<text>`: the
  stamp's id, and the text in front of the tag in the part of the address
  after `#`, which browsers do not send to a server. The verify page then
  fetches the stamp by its id.
- **Verify NTK stamp** in the text selection menu does the same for text you
  select, and only when you choose it.
- NEAR testnet by default; NEAR mainnet when the user chooses it in settings. Each network keeps its own fingerprints and stamps.

Debug builds, which are never distributed, also save each sent session in the
app's private storage for tuning.

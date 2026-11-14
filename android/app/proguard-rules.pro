# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /home/rkr/Android/Sdk/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# If your project uses WebView with JS, uncomment the following
# and specify the fully qualified class name to the JavaScript interface
# class:
#-keepclassmembers class fqcn.of.javascript.interface.for.webview {
#   public *;
#}

-keep class rkr.simplekeyboard.inputmethod.R
-keep class rkr.simplekeyboard.inputmethod.latin.settings.SettingsFragment
-keep class rkr.simplekeyboard.inputmethod.latin.settings.LanguagesSettingsFragment
-keep class rkr.simplekeyboard.inputmethod.latin.settings.SingleLanguageSettingsFragment

# NTK: drawables inflated from XML by class name (res/drawable/ntk_*.xml,
# <drawable class="tools.ntk.ui.…">). AAPT2 writes no keep rules for those, and the
# framework creates them with Class.forName(name).getConstructor().
-keep class tools.ntk.ui.TileDrawable { public <init>(); }
-keep class tools.ntk.ui.FloorDrawable { public <init>(); }

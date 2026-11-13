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
- Testnet only.

Debug builds, which are never distributed, also save each sent session in the
app's private storage for tuning.

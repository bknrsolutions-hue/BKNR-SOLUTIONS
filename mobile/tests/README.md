# SVBK native mobile tests

The Expo application uses Maestro for device-level smoke and login-flow tests.
Build/install an Android development or preview build with package
`com.bknr.erp`, start an emulator, then run:

```bash
maestro test mobile/tests/maestro/launch-and-validation.yaml
```

The OTP journey is opt-in because it must use a synthetic test/staging user:

```bash
SVBK_MOBILE_TENANT_CODE=TSTA0001 \
SVBK_MOBILE_EMAIL=admin.alpha@example.test \
SVBK_MOBILE_PASSWORD='TestOnly#2026' \
SVBK_MOBILE_OTP=0000 \
maestro test mobile/tests/maestro/login-otp.yaml
```

Never point these flows at production or put credentials/OTPs in the YAML.

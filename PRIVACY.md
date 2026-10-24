# ScaleShift Privacy

Last updated: 23 October 2026

## Audio processing

ScaleShift processes captured tab audio locally in your browser. Audio is not uploaded to ScaleShift's licensing service. Audio capture begins only after you explicitly connect the extension to a tab.

## Local storage

Chrome extension storage is used to retain your interface preferences, recent audio parameters, a randomly generated installation identifier, and (if you activate Pro) your license key and cached license status.

## License verification

If you activate a Pro license, ScaleShift sends your license key and a randomly generated installation identifier to the configured ScaleShift Supabase Edge Functions to validate the key and enforce the one-installation-per-license limit. The licensing database stores a SHA-256 hash of the license key rather than the raw key, plus license status, optional expiry, and device-binding timestamps. License checks may occur during activation and periodically afterward. During temporary connectivity problems, a previously verified license may be accepted for up to seven days.

The Supabase project operator can access license records for support, revocation, and device resets. The payment provider, if one is added later, may separately process purchase details under its own privacy policy. Payment integration is not active in this source package.

## Website and third parties

The extension does not send audio, browsing history, page URLs, or page content to the license service. The license service receives only the key and installation identifier required for licensing. Supabase infrastructure is used to operate license verification.

## Contact

Before publishing, replace this section with the developer's support contact and link to the public privacy policy.

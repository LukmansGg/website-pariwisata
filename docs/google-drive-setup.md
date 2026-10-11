# Google Drive media setup for MadiunTrip

The staff dashboard uploads public tourism images to a dedicated `MadiunTrip Assets` folder in a Google Drive account. Supabase stores the resulting image URL with the destination, partner, or campaign record. The OAuth refresh token is encrypted before it is stored in Supabase. Google OAuth client credentials and the encryption key stay in server-only environment variables.

## 1. Enable Google Drive API

1. Open the Google Cloud project used for the MadiunTrip OAuth client.
2. Go to **APIs & Services → Library**.
3. Find **Google Drive API** and select **Enable**.

The $300 Free Trial banner is not required for this prototype's standard Drive API usage. Do not add billing details just for this setup.

## 2. Configure the OAuth consent screen

1. Open **Google Auth Platform → Branding**, complete the application name and support email.
2. Under **Audience**, choose **External** for a regular personal Google account and add the Google account that will own the tourism media as a test user.
3. Under **Data Access**, request only `https://www.googleapis.com/auth/drive.file`.
4. For a private prototype, keep the app in Testing. Google may expire test-user Drive authorizations after seven days; if uploads later report a revoked/expired token, the admin can reconnect Drive in the dashboard.

## 3. Check the OAuth web client

Use the **Web application** client that was just created.

- Name can be `MadiunTrip Drive Prototype`.
- Leave **Authorized JavaScript origins** empty; authorization runs through the Next.js server.
- Add this exact **Authorized redirect URI** for local development:

  `http://localhost:3000/api/google-drive/callback`

The production redirect URI must use the same callback path on your deployed HTTPS origin, for example `https://your-domain.example/api/google-drive/callback`. It must also match `APP_ORIGIN` exactly.

## 4. Configure local environment variables

Add the values to the project root `.env.local`. Keep it out of git and do not send the values in chat.

```dotenv
APP_ORIGIN=http://localhost:3000
GOOGLE_DRIVE_CLIENT_ID=your-client-id
GOOGLE_DRIVE_CLIENT_SECRET=your-client-secret
GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY=your-random-32-byte-base64-key
```

Generate the encryption key in the project terminal with:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Use the output only as `GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY`. Do not reuse the OAuth client secret as the encryption key. Add the same server-only variables to the production hosting environment after deployment.

## 5. Apply the Supabase migration

Run `supabase/migrations/20261010000001_admin_workspace.sql` if the workspace content tables are not installed yet. Then run `supabase/migrations/20261011000000_google_drive_integration.sql` to add the encrypted Google Drive connection row with staff-only RLS.

## 6. Connect Drive from the dashboard

1. Restart `npm run dev` after editing `.env.local`.
2. Sign in to MadiunTrip using an admin account.
3. Open **Petugas & akses → Integrasi media → Hubungkan Drive**.
4. Select the dedicated Google account that owns the media and approve the `drive.file` access.
5. Return to the dashboard. The server creates a `MadiunTrip Assets` folder and stores the encrypted OAuth refresh token in Supabase.

Editors can upload images after the admin connects Drive. Only an admin can connect or reconnect the Google account.

## Image sharing and limits

- Dashboard upload accepts JPEG, PNG, WebP, and AVIF, up to 8 MB per image.
- Uploaded files receive **Anyone with the link — Viewer** permission because visitors need to see these photos on public destination pages. Upload only intended public tourism content; never upload private documents to this media flow.
- An image upload creates the Drive file first. The form's **Simpan** button then stores its URL in Supabase.
- If the form is abandoned after upload, the file remains in `MadiunTrip Assets` and can be cleaned up from Drive later.
- Google Drive is adequate for a prototype and modest traffic, but it is not a dedicated image CDN. Keep an eye on API quotas and image-load reliability before a public launch.

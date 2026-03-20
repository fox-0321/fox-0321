# Birthday Map Website

This project now supports two ways to run:

- Local all-in-one mode for development with `server.js`
- Split deployment mode with GitHub Pages for the frontend and Alibaba Cloud Function Compute + OSS for protected photos

## Frontend config

Edit [src/config.js](/e:/他人物品/260321/repo/src/config.js).

Important fields:

- `siteTitle`: page title
- `apiBaseUrl`: backend API base URL

Examples:

- Local mode: `apiBaseUrl: ""`
- GitHub Pages + Alibaba Cloud: `apiBaseUrl: "https://your-function-domain.example.com"`

## Local run

1. Install dependencies:
   `npm install`
2. Copy `.env.example` to `.env`
3. Set at least:
   - `PHOTO_PASSCODE`
   - `TOKEN_SECRET`
4. Start the app:
   `npm run dev`
5. Visit `http://localhost:4000`

If you want different passwords for different provinces in local mode, you can use either:

- `PHOTO_PASSCODE_MAP_PATH=server-data/photo-passcodes.json`
- `PHOTO_PASSCODE_MAP_JSON={"beijing":"fox-001","jiangsu":"cat-002"}`

An example file is included at [photo-passcodes.example.json](/e:/他人物品/260321/repo/photo-passcodes.example.json).

## GitHub Pages + Alibaba Cloud architecture

The final production architecture should be:

- GitHub Pages: hosts the static frontend
- Alibaba Cloud OSS: stores private images
- Alibaba Cloud Function Compute: verifies password and generates short-lived OSS signed URLs

The frontend calls:

- `GET /api/photos/available`
- `POST /api/photo-access`

These endpoints should be served by your Function Compute app.

## Alibaba Cloud backend code

The source lives in [aliyun/fc/app.js](/e:/他人物品/260321/repo/aliyun/fc/app.js), and the upload package is built to [dist/aliyun-fc-upload.zip](/e:/他人物品/260321/repo/dist/aliyun-fc-upload.zip).

It expects these environment variables in Function Compute:

- `OSS_REGION`
- `OSS_BUCKET`
- `OSS_ACCESS_KEY_ID`
- `OSS_ACCESS_KEY_SECRET`
- `PHOTO_MANIFEST_JSON`
- either `PHOTO_PASSCODE` or `PHOTO_PASSCODE_MAP_JSON`
- optional: `CORS_ALLOW_ORIGIN`

### Manifest format

`PHOTO_MANIFEST_JSON` is a JSON object mapping province slug to OSS object key.

Example:

```json
{
  "beijing": "memories/beijing/photo.jpg",
  "shanghai": "memories/shanghai/photo.jpg"
}
```

### Single password mode

Set:

- `PHOTO_PASSCODE=your-one-password`

Then every photo uses the same password.

### Per-province password mode

Set:

- `PHOTO_PASSCODE_MAP_JSON`

Example:

```json
{
  "beijing": "fox-001",
  "shanghai": "cat-002"
}
```

If a province exists in `PHOTO_PASSCODE_MAP_JSON`, that password is used. Otherwise the backend falls back to `PHOTO_PASSCODE` if you set one.

Example for your current unlocked provinces:

```json
{
  "beijing": "fox-001",
  "jiangsu": "cat-002",
  "hunan": "memory-003",
  "guangdong": "sunset-004",
  "hong-kong": "harbor-005"
}
```

## Alibaba Cloud deployment steps

These steps are based on Alibaba Cloud Function Compute web functions:
https://www.alibabacloud.com/help/en/functioncompute/fc/user-guide/creating-a-web-function

### 1. Prepare OSS

1. Create a private OSS bucket.
2. Upload your image files into that bucket.
3. Record each object key, for example `memories/beijing/photo.jpg`.

Alibaba Cloud OSS signed URL reference:
https://www.alibabacloud.com/help/en/oss/how-to-obtain-the-url-of-a-single-object-or-the-urls-of-multiple-objects

### 2. Create a RAM user

1. Create a RAM user instead of using the main account keys.
2. Give that RAM user minimum OSS read permission for your bucket.
3. Create an AccessKey pair for that RAM user.

Alibaba Cloud RAM AccessKey guidance:
https://www.alibabacloud.com/help/doc-detail/2867359.html

### 3. Create the Function Compute web function

1. Open Function Compute console.
2. Choose **Create Function**.
3. Choose **Web Function**.
4. Runtime: choose a current Node.js runtime available in your region.
5. Upload [dist/aliyun-fc-upload.zip](/e:/他人物品/260321/repo/dist/aliyun-fc-upload.zip) as the function code package.
6. Set startup command to:
   `node bundle.cjs`
7. Set environment variables listed above.

### 4. Configure CORS

Set:

- `CORS_ALLOW_ORIGIN=https://<your-github-username>.github.io`

If your GitHub Pages site is under a project path, the origin is still just the scheme + host.

### 5. Get the public function URL

After deployment, copy the public URL or custom domain of the Function Compute web function.

Example:

```text
https://your-api.example.com
```

### 6. Point the frontend to Alibaba Cloud

Edit [src/config.js](/e:/他人物品/260321/repo/src/config.js):

```js
apiBaseUrl: "https://your-api.example.com"
```

Then publish the frontend to GitHub Pages.

## Publish the frontend to GitHub Pages

GitHub's official guide for publishing from a branch is here:
https://docs.github.com/pages/getting-started-with-github-pages/creating-a-github-pages-site

Recommended steps for this repo:

1. Create a GitHub repository and push this project to it.
2. In GitHub, open **Settings** -> **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select your main branch and the `/ (root)` folder, then save.
5. Wait for the Pages deployment to finish.
6. Open the published site URL from the Pages settings screen.

Notes:

- If the repository name is not `fox0321.github.io`, the Pages URL will usually look like `https://fox0321.github.io/<repo-name>/`.
- This frontend uses relative asset paths, so project-page deployment is fine.
- Keep the root [`.nojekyll`](/e:/他人物品/260321/repo/.nojekyll) file in the repo so GitHub Pages serves the static files directly without Jekyll processing.
- Keep `src/config.js` pointed at your Function Compute URL before publishing.

## Local mode vs OSS mode

### Local mode

Use this while developing locally.

Set in `.env`:

- `PHOTO_SOURCE=local`
- `PHOTO_PASSCODE=your-password`
- optional: `PHOTO_PASSCODE_MAP_PATH=server-data/photo-passcodes.json`
- optional: `PHOTO_PASSCODE_MAP_JSON={"beijing":"fox-001","jiangsu":"cat-002"}`
- `TOKEN_SECRET=your-long-random-secret`

Photos are read from the existing `photos/<province-slug>/photo.*` folders, but they are no longer publicly exposed as static files. The server issues a short-lived tokenized URL for each successful password check.

### OSS mode in the local Node server

You can still use the local Node server with OSS if you want.

Set in `.env`:

- `PHOTO_SOURCE=oss`
- `PHOTO_PASSCODE=your-password`
- optional: `PHOTO_PASSCODE_MAP_PATH=server-data/photo-passcodes.json`
- optional: `PHOTO_PASSCODE_MAP_JSON={"beijing":"fox-001","jiangsu":"cat-002"}`
- `TOKEN_SECRET=your-long-random-secret`
- `PHOTO_MANIFEST_PATH=server-data/photo-manifest.json`
- `OSS_REGION=oss-cn-hangzhou`
- `OSS_BUCKET=your-private-bucket-name`
- `OSS_ACCESS_KEY_ID=your-ram-access-key-id`
- `OSS_ACCESS_KEY_SECRET=your-ram-access-key-secret`

## Security notes

- GitHub Pages itself does not provide a secure backend.
- The secure part must live in Function Compute or another real backend.
- OSS itself does not validate your custom password; your function does.
- Keep OSS keys and manifest/password JSON private.

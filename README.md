# PromptVerse

Pinterest-inspired AI prompt sharing app. Users can upload an image and its prompt, browse/search/filter, copy prompts, save favorites locally, and switch themes.

## Requirements
- Node.js 18+ recommended
- VS Code

## Run locally
1. Extract the ZIP and open the `promptverse` folder in VS Code.
2. Open Terminal in VS Code.
3. Run `npm install`
4. Run `npm start`
5. Open http://localhost:3000

Uploaded images are stored in `public/uploads/`; prompt data is stored in `data/prompts.json`. Do not delete these folders if you want to keep your posts.

## Notes
- This starter has no user accounts or moderation. Anyone who can access the app can post.
- Favorites are saved in the current browser's local storage.
- For public deployment, use persistent file storage or a database and add authentication, rate limiting, moderation/reporting, and backups. Platforms with ephemeral filesystems may erase uploads/data on redeploy.
- Image uploads are limited to 8 MB and common image MIME types.

# Store listing kit

Everything needed to submit Social Cleanup to the **Chrome Web Store** and **Microsoft Edge Add-ons**. Each field below is ready to copy and paste.

**Upload this file:** `dist/social-cleanup-v<version>-store.zip` (run `npm run package`). The stores need `manifest.json` at the top of the zip, which the normal GitHub download doesn't have.

**Images:** `store/assets/` (regenerate with `node store/make-assets.mjs`).

| File | Use |
|---|---|
| `icons/icon-128.png` | Store icon (both stores) |
| `store/assets/logo-300x300.png` | Edge: Extension Store logo |
| `store/assets/screenshot-1…5-*.png` (1280×800) | Screenshots (both stores, in order 1–5) |
| `store/assets/promo-small-440x280.png` | Small promo tile (both stores) |
| `store/assets/promo-marquee-1400x560.png` | Marquee / large promo tile (both stores, optional) |

---

## Shared fields

**Name**
```
Social Cleanup
```

**Short description / summary** (comes from `manifest.json`, 95 characters)
```
Bulk-delete your old social media posts by date range. Everything runs locally in your browser.
```

**Full description**
```
Delete years of old social media posts in a few clicks.

Job hunting, starting fresh, or just tired of what 2014 you posted? Social Cleanup finds your old posts, lets you review them, and deletes the ones you choose. It saves a backup first.

HOW IT WORKS
1. Pick an account. Make sure you're signed in to it in this browser.
2. Choose how far back: older than 1, 3 or 5 years, everything, or exact dates.
3. Review every post. Untick anything you want to keep, or protect posts by keyword or popularity.
4. Confirm. A backup downloads to your computer, then Social Cleanup works through your posts in the background. Pause or stop anytime.

SUPPORTED SITES
• Reddit: posts and comments (automatic)
• X / Twitter: posts, replies, reposts and likes, using your X data archive (automatic)
• Facebook: posts, moved to Facebook's trash first so you have 30 days to change your mind (automatic)
• Instagram, LinkedIn and Threads: a guided checklist that opens each site's own tools, including Instagram's bulk delete with a date filter

PRIVATE BY DESIGN
• Runs entirely on your computer. There are no servers, accounts, analytics or tracking.
• Never asks for your password. It uses the session you're already signed into.
• Your list of posts is erased automatically when a cleanup finishes. "Clear all my data" erases everything at any time.
• Websites can't read or control the extension.
• Free and open source, so anyone can check exactly what it does.

Some sites discourage automated tools in their terms. Social Cleanup only acts on your own account, at a steady pace that respects each site's limits.

Made by Sweeney Creative Co.
Source code and help: https://github.com/divinadevosai/socialcleanup
```

**Privacy policy URL**
```
https://github.com/divinadevosai/socialcleanup/blob/main/PRIVACY.md
```

**Homepage / website URL**
```
https://github.com/divinadevosai/socialcleanup
```

**Support URL**
```
https://github.com/divinadevosai/socialcleanup/issues
```

**Category:** *Social & Communication* if offered, otherwise *Productivity* (Chrome: *Productivity → Tools*).

**Language:** English.

**Price:** Free.

---

## Chrome Web Store: Privacy practices tab

**Single purpose description**
```
Social Cleanup has a single purpose: helping people delete their own old posts from their social media accounts, in bulk and by date range, after reviewing them and saving a backup.
```

**Permission justifications**

`storage`
```
Saves the temporary list of the user's own posts and the cleanup's progress on the user's computer, so the user can review posts before deleting them and a long cleanup can pause and resume. This data is erased automatically when the cleanup finishes, and the user can erase it at any time with "Clear all my data". Nothing is sent anywhere.
```

`unlimitedStorage`
```
Large accounts and X/Twitter data archives can contain tens of thousands of posts, which can exceed the default local storage limit. The data still stays on the user's computer and is erased when the cleanup finishes.
```

`sidePanel`
```
The extension's entire interface is a side panel where the user picks an account, reviews posts and confirms deletion.
```

`alarms`
```
While a cleanup is running, a periodic alarm lets the extension resume the job if Chrome suspends its background service worker, so long cleanups don't silently stop. The alarm does nothing when no cleanup is running.
```

Host permissions (`*://*.reddit.com/*`, `*://x.com/*`, `*://twitter.com/*`, `*://*.facebook.com/*`, `*://abs.twimg.com/*`)
```
reddit.com, x.com, twitter.com and facebook.com: the extension lists and deletes the user's own posts on these sites using the session the user is already signed into, exactly as the site does when the user clicks Delete. It only acts after the user reviews the posts and confirms. It doesn't read or change anything else.

abs.twimg.com: X serves its web app's public JavaScript file from this host. The extension reads that file as text (it is never executed) to find the current names of X's delete operations, so deletions keep working when X updates its site. No user data or cookies are sent in this request.
```

**Are you using remote code?**
Choose **No, I am not using remote code**. All of the extension's code ships in the package. The X script file above is only read as text to look up names, and is never run.

**Data usage**

Social Cleanup doesn't send any user data off the user's computer. To be fully transparent, tick these categories, which the extension *handles locally*:
- **Personally identifiable information** (the username of the account being cleaned up, shown in the panel)
- **Website content** (the user's own posts, listed for review)

Then tick all three certifications:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** as above.

---

## Notes for reviewers

Paste this into Chrome's *Test instructions* field and Edge's *Notes for certification* field.
```
How to test Social Cleanup (about 2 minutes, Reddit is quickest):

1. Sign in to any Reddit account that has a few posts or comments (a test account is fine).
2. Click the Social Cleanup toolbar icon to open the side panel and choose "Reddit".
3. Choose "Pick exact dates…" and select a narrow range containing 1–2 posts, then click "Find my posts". Nothing is deleted at this step.
4. On the review screen, untick everything except one item, then click "Continue".
5. Tick "I understand…" and click "Delete 1 item". A backup (JSON + HTML) downloads first, then the item is deleted. The final screen confirms that the post list and username were erased from the extension's storage.

Other features:
- Instagram, LinkedIn and Threads show a guided checklist. The extension doesn't access those sites; it only opens their pages in a new tab.
- X/Twitter requires the user's own X data archive (Settings → Your account → Download an archive of your data).
- Facebook works on the Activity Log page in the English version of Facebook.

Privacy: no data leaves the user's computer except the delete requests to the site being cleaned up. Source code: https://github.com/divinadevosai/socialcleanup
```

---

## Microsoft Edge Add-ons: extra fields

**Search terms** (up to 7)
```
delete old posts
delete tweets
reddit cleanup
social media cleaner
facebook post cleanup
privacy
digital cleanup
```

**Contact details:** use the support URL above, or an email address you're happy to make public.

**Age rating questionnaire:** answer *No* to all content questions. The extension contains no violence, mature content, gambling, user-to-user communication or location sharing.

---

## Submission checklist

**Chrome Web Store** ([developer dashboard](https://chrome.google.com/webstore/devconsole), one-time $5 registration)
- [ ] Register and verify your developer email
- [ ] *New item* → upload the `-store.zip`
- [ ] Store listing: description, category, language, icon, screenshots 1–5, small promo tile, (optional) marquee
- [ ] Privacy practices: single purpose, permission justifications, remote code = No, data usage + certifications, privacy policy URL
- [ ] Distribution: Public, all regions
- [ ] Test instructions (Notes for reviewers above)
- [ ] Submit for review (usually a few days; extensions acting on other sites may get follow-up questions)

**Microsoft Edge Add-ons** ([Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview), free)
- [ ] Register as an Edge developer
- [ ] *Create new extension* → upload the `-store.zip`
- [ ] Availability: Public, all markets
- [ ] Properties: category, privacy policy URL, website, support contact
- [ ] Store listing: description, Extension Store logo (300×300), small promo tile, screenshots, search terms
- [ ] Notes for certification (Notes for reviewers above)
- [ ] Publish (review is usually up to 7 business days)

**Each update:** bump the version in `manifest.json`, run `npm run package`, upload the new `-store.zip`.

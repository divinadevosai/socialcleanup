# Privacy Policy

**Social Cleanup** browser extension · Effective October 8, 2026

Social Cleanup is a free, open-source browser extension made by Sweeney Creative Co (GitHub: [divinadevosai](https://github.com/divinadevosai)). It helps you delete your own old posts from social media sites.

## The short version

- **We don't collect any data.** There are no Social Cleanup servers, accounts, analytics or tracking.
- **Everything happens on your computer**, inside your browser.
- **We never see your passwords.** The extension uses the session you're already signed into in your browser.
- **Nothing is sold or shared** with anyone, ever.

## What the extension handles, and where it stays

To delete your posts, the extension temporarily works with:

| Information | Why | Where it's kept | When it's erased |
|---|---|---|---|
| A list of your posts (text, date, link, type) | So you can review them and choose what to delete | Your browser's private extension storage, on your computer only | Automatically when a cleanup finishes (except any posts that couldn't be deleted, kept so you can retry), when you start over or switch account, or when you click **Clear all my data** |
| Your username on the site you're cleaning up | To show which account you're signed in as | Same as above | Same as above |
| Progress (counts and a short activity log) | So a cleanup can pause and resume | Same as above | Same as above |
| Numbers identifying the browser tabs it opened | So it reuses its own tab | Temporary browser storage that clears when the browser closes | When the browser closes, or on **Clear all my data** |

This storage can only be read by the extension's own panel and background process. It isn't readable by websites, by other extensions, or by the parts of the extension that run inside social media pages.

Uninstalling Social Cleanup also removes all of its stored data.

**Backups:** before deleting, the extension saves a backup of the selected posts (a data file and a readable web page) to your computer's Downloads folder. Those files are yours; the extension doesn't upload or read them afterwards.

**X/Twitter archives:** if you add your X data archive, it's read in your browser on your computer. Only the post and like files inside it are opened, and the archive is never uploaded.

## Who the extension talks to

The extension only communicates with the sites you choose to clean up, using your existing login, to list and delete **your own** posts:

- **reddit.com**
- **x.com / twitter.com**, plus **abs.twimg.com**, X's public server for its web app code. The extension downloads X's public web-app script to find the current names of X's delete functions. No personal information or cookies are sent in that request.
- **facebook.com**

For **Instagram, LinkedIn and Threads**, the extension doesn't communicate with those sites at all. Its guided checklist only opens their own pages in a new tab for you.

No data is ever sent to Sweeney Creative Co, to the developer, or to any other third party.

## Permissions and why they're needed

| Permission | Why |
|---|---|
| **Storage** and **Unlimited storage** | To keep the temporary list of posts while you review them. Large accounts and X archives can exceed the default storage size. |
| **Side panel** | To show the Social Cleanup panel. |
| **Alarms** | To resume a cleanup automatically if the browser pauses the extension in the background. |
| **Access to reddit.com, x.com, twitter.com, abs.twimg.com and facebook.com** | To list and delete your own posts on those sites, as described above. The extension can't see or change any other website. |

## Chrome Web Store User Data Policy

Social Cleanup's use of information complies with the [Chrome Web Store User Data Policy](https://developer.chrome.com/docs/webstore/program-policies/user-data-faq), including the **Limited Use** requirements. Information is used only to provide the extension's single purpose, deleting your own posts, and is never transferred, sold, used for advertising, or used to determine creditworthiness.

## Children

Social Cleanup isn't directed at children under 13 and doesn't knowingly handle children's information. It follows the age rules of the sites it works with.

## Security

The extension is open source, so anyone can check exactly what it does. It's covered by automated security tests: stored data is locked to the extension itself, websites can't control it, and content from posts is always shown as plain text.

## Changes to this policy

If this policy changes, the updated version will be published at this address with a new effective date.

## Contact

Questions or concerns? Open an issue at [github.com/divinadevosai/socialcleanup/issues](https://github.com/divinadevosai/socialcleanup/issues).

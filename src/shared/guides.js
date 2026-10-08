// Guided platforms: sites with no safe way for a tool to delete posts. The
// extension never touches these sites; it only opens their own pages and
// walks the person through each site's built-in tools, step by step.
//
// Sites rename menus now and then, so steps describe where to look as well
// as what to click. All links must be https (checked in tests).

export const GUIDES = {
  instagram: {
    id: 'instagram',
    name: 'Instagram',
    tile: { letter: 'I', color: '#c13584' },
    blurb: 'Guided: posts, reels and comments',
    why: "Instagram doesn't let other tools delete posts, but it has its own bulk delete with a date filter. We'll walk you through it.",
    steps: [
      {
        title: 'Save a copy of your data (optional)',
        text: 'In Accounts Center, choose Download your information. Instagram emails you when it\'s ready.',
        url: 'https://accountscenter.instagram.com/info_and_permissions/dyi/',
        open: 'Open Accounts Center',
      },
      {
        title: 'Open your posts in Your activity',
        text: 'This is Instagram\'s own page for managing posts in bulk. In the app: Profile → ☰ → Your activity → Posts.',
        url: 'https://www.instagram.com/your_activity/photos_and_videos/posts/',
        open: 'Open Your activity',
      },
      {
        title: 'Filter by date',
        text: 'Tap Sort & filter, set a Start date and End date (for example, everything before 2020), then Apply.',
      },
      {
        title: 'Select and delete',
        text: 'Tap Select, tick the posts, then Delete. Deleted posts sit in Recently deleted for 30 days in case you change your mind. Prefer to hide them instead? Choose Archive.',
      },
      {
        title: 'Repeat for reels and comments',
        text: 'Your activity has the same Select tool for Reels and for Comments you\'ve left on other posts.',
        url: 'https://www.instagram.com/your_activity/interactions/comments/',
        open: 'Open your comments',
      },
    ],
    tip: 'Want to hide everything in seconds instead? Switch to a private account: Settings → Account privacy.',
  },

  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
    tile: { letter: 'in', color: '#0a66c2' },
    blurb: 'Guided: posts and comments',
    why: "LinkedIn has no bulk delete, and it can restrict accounts that use automation tools. So we'll guide you through the quickest safe way instead.",
    steps: [
      {
        title: 'Save a copy of your data (optional)',
        text: 'Settings → Data privacy → Get a copy of your data.',
        url: 'https://www.linkedin.com/mypreferences/d/download-my-data',
        open: 'Open LinkedIn settings',
      },
      {
        title: 'Open your activity',
        text: "This lists everything you've posted. If it doesn't open your own page, go to your profile → Activity → Show all.",
        url: 'https://www.linkedin.com/in/me/recent-activity/all/',
        open: 'Open your activity',
      },
      {
        title: 'Delete posts one by one',
        text: 'On each post, click ··· → Delete post → Delete. Start with the oldest and anything you wouldn\'t want a recruiter to see.',
      },
      {
        title: 'Check your comments too',
        text: 'Switch to the Comments tab on the same page. Click ··· on a comment → Delete.',
      },
      {
        title: 'Tidy your profile for recruiters',
        text: 'While you\'re there, review your headline, About and Featured sections. They\'re the first things recruiters read.',
        url: 'https://www.linkedin.com/in/me/',
        open: 'Open your profile',
      },
    ],
    tip: 'Take it at a steady pace. There\'s no rush, and LinkedIn may slow you down if you delete very fast.',
  },

  threads: {
    id: 'threads',
    name: 'Threads',
    tile: { letter: '@', color: '#333333' },
    blurb: 'Guided: posts and replies',
    why: "Threads has no bulk delete, and its API needs a registered developer app. So we'll show you the fastest built-in options instead.",
    steps: [
      {
        title: 'Save a copy of your data (optional)',
        text: 'Threads data downloads through Accounts Center: choose Download your information.',
        url: 'https://accountscenter.instagram.com/info_and_permissions/dyi/',
        open: 'Open Accounts Center',
      },
      {
        title: 'Fastest option: make your profile private',
        text: 'Settings → Privacy → Private profile. Only approved followers will see your posts. It takes seconds and you can undo it anytime.',
        url: 'https://www.threads.com/settings/privacy',
        open: 'Open privacy settings',
      },
      {
        title: 'Open your profile',
        text: 'Go to your profile and the Threads tab, which lists everything you\'ve posted.',
        url: 'https://www.threads.com/',
        open: 'Open Threads',
      },
      {
        title: 'Delete posts and replies',
        text: 'On each post, tap ··· → Delete → Delete. Do the same on the Replies tab.',
      },
    ],
    tip: 'Want a completely fresh start? Settings → Account → Deactivate or delete profile removes your whole Threads profile without touching Instagram.',
  },
};

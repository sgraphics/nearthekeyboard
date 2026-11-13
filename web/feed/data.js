// What the demo feed shows. Every account is invented; the feed reads like a
// familiar social app without being one. Pure data, no DOM.

/**
 * The built-in reply with a real stamp. One constant: to show a newer stamp,
 * replace the text (with its tag) and the author who typed it. The stamp below
 * was made by the test suite's synthetic typist on the account ntk-alice.testnet.
 */
export const STAMPED_REPLY = Object.freeze({
  text: 'This reply was typed by me, a human, on my own phone, one key at a time. [NTK e65ee28db5]',
  name: 'Alice',
  handle: 'ntk_alice',
});

export const MAIN_POST = Object.freeze({
  name: 'Ines Varga',
  handle: 'inesvarga',
  text: 'Every reply under my last post read the same: warm, on topic, and empty. ' +
    'I am fairly sure half of them were written by a machine.\n\n' +
    'If you are a person, reply here. How would you prove it?',
  time: '9:41 AM · Nov 13, 2026',
  views: 48213,
  replies: 214,
  reposts: 1104,
  likes: 6870,
});

/** Shown below your own replies, newest first. */
export const BUILTIN_REPLIES = Object.freeze([
  { ...STAMPED_REPLY, time: '1h', replies: 3, reposts: 9, likes: 41, views: 2210 },
  {
    name: 'Brightpath Growth',
    handle: 'brightpath_grow',
    text: 'Great question! In today’s fast-paced digital landscape, authenticity matters more than ever. ' +
      'Here are five ways to build genuine trust with your audience 🚀',
    time: '2h', replies: 0, reposts: 1, likes: 2, views: 905,
  },
  {
    name: 'Tomas Rhee',
    handle: 'trhee',
    text: 'Honestly I can’t tell any more. I have started reading replies the way I read spam.',
    time: '3h', replies: 2, reposts: 4, likes: 57, views: 3120,
  },
  {
    name: 'Nova Insights',
    handle: 'novainsights',
    text: 'Absolutely agree! Your posts always spark such meaningful conversations. ' +
      'Keep sharing valuable content like this! 🙌',
    time: '4h', replies: 0, reposts: 0, likes: 1, views: 640,
  },
]);

/** Who your own replies come from. */
export const YOU = Object.freeze({ name: 'You', handle: 'you' });

/**
 * Curated collection of sales-themed GIFs.
 * Used throughout the app for personality — empty states, celebrations, loading, etc.
 *
 * Usage:
 *   import { salesGifs, getRandomGif } from "@/lib/sales-gifs";
 *   <img src={getRandomGif("celebration")} alt="..." />
 */

export const salesGifs = {
  // Always Be Closing
  alwaysBeClosing: [
    "https://media.giphy.com/media/xUOxf5Nt1LAffsrEcg/giphy.gif", // Alec Baldwin ABC speech
    "https://media.giphy.com/media/l0HlvB7ENDhPmDGM0/giphy.gif", // Coffee is for closers
  ],

  // Celebration / Deal won
  celebration: [
    "https://media.giphy.com/media/3o6fJ1BM7R2EBRDnxK/giphy.gif", // Wolf of Wall Street chest thump
    "https://media.giphy.com/media/l0MYt5jPR6QX5APm0/giphy.gif", // The Office celebration
    "https://media.giphy.com/media/artj92V8o75VPL7AeQ/giphy.gif", // Will Ferrell excited
    "https://media.giphy.com/media/l4pTfx2qLszoacZRS/giphy.gif", // Success kid
    "https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif", // Parks and rec treat yo self
  ],

  // Hustling / Working hard
  hustle: [
    "https://media.giphy.com/media/1AdZGh8hBiEBqE3OHk/giphy.gif", // Typing fast
    "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif", // Cat typing
    "https://media.giphy.com/media/LHZyixOnHwDDy/giphy.gif", // Phone call hustle
  ],

  // Empty states / Nothing here yet
  empty: [
    "https://media.giphy.com/media/hEc4k5pN17GZq/giphy.gif", // Tumbleweeds
    "https://media.giphy.com/media/26ufnwz3wDUli7GU0/giphy.gif", // Waiting
    "https://media.giphy.com/media/l2JehQ2GitHGdVG9Y/giphy.gif", // John Travolta confused
  ],

  // Loading / Processing
  loading: [
    "https://media.giphy.com/media/tXL4FHPSnVJ0A/giphy.gif", // Loading cat
    "https://media.giphy.com/media/3oEjI6SIIHBdRxXI40/giphy.gif", // Bart Simpson waiting
  ],

  // Hot leads / Fire
  hotLead: [
    "https://media.giphy.com/media/j6uK36y32LxQs/giphy.gif", // This is fine fire
    "https://media.giphy.com/media/l0ExbnGIX9sMFS7PG/giphy.gif", // Fire
    "https://media.giphy.com/media/yr7n0u3qzO9nG/giphy.gif", // Money money money
  ],

  // Rejection / Lead dismissed
  rejection: [
    "https://media.giphy.com/media/ac7MA7r5IMYda/giphy.gif", // Next!
    "https://media.giphy.com/media/3ohzdGnD5HWf3WWBWU/giphy.gif", // Shrug
  ],

  // Motivational
  motivation: [
    "https://media.giphy.com/media/GcSqyYa2aF8dy/giphy.gif", // You got this
    "https://media.giphy.com/media/BcPbK9ci4EU31qgNzE/giphy.gif", // Lets go
    "https://media.giphy.com/media/5GoVLqeAOo6PK/giphy.gif", // Eye of the tiger
  ],

  // Money / Revenue
  money: [
    "https://media.giphy.com/media/l3q2SaisWTeZnV9wY/giphy.gif", // Make it rain
    "https://media.giphy.com/media/67ThRZlYBvibtdF9JH/giphy.gif", // Shut up and take my money
    "https://media.giphy.com/media/l0HFkA6omMkMRMRkA/giphy.gif", // Money printer
  ],
} as const;

export type GifCategory = keyof typeof salesGifs;

/** Pick a random GIF from a category */
export function getRandomGif(category: GifCategory): string {
  const gifs = salesGifs[category];
  return gifs[Math.floor(Math.random() * gifs.length)];
}

/** Sales quotes for empty states and loading screens */
export const salesQuotes = [
  { text: "Always Be Closing.", attribution: "Glengarry Glen Ross" },
  { text: "Coffee is for closers.", attribution: "Glengarry Glen Ross" },
  { text: "You miss 100% of the shots you don't take.", attribution: "Wayne Gretzky — Michael Scott" },
  { text: "Every sale has five basic obstacles: no need, no money, no hurry, no desire, no trust.", attribution: "Zig Ziglar" },
  { text: "The secret of getting ahead is getting started.", attribution: "Mark Twain" },
  { text: "Opportunities don't happen. You create them.", attribution: "Chris Grosser" },
  { text: "Don't find customers for your products, find products for your customers.", attribution: "Seth Godin" },
  { text: "Success is walking from failure to failure with no loss of enthusiasm.", attribution: "Winston Churchill" },
  { text: "Leads are like bananas. They go bad quick.", attribution: "Sales Wisdom" },
  { text: "The best time to prospect was yesterday. The second best time is now.", attribution: "Sales Proverb" },
] as const;

/** Pick a random sales quote */
export function getRandomQuote() {
  return salesQuotes[Math.floor(Math.random() * salesQuotes.length)];
}

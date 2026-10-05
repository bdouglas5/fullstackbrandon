// Seeded authored language, never model-generated testimonials. Each rating has
// 1,000 distinct combinations; the score still comes from actual delivery waits.
const OPENINGS = {
  5: [
    "Right when we needed it.",
    "Another dependable delivery.",
    "Our latest orders have been a breeze.",
    "Brandon has our routine down.",
    "A very happy kitchen here.",
    "This is how you earn a regular.",
    "The delivery schedule works beautifully.",
    "Everything arrived in good time.",
    "No chasing our orders this week.",
    "A little business we can count on.",
  ],
  4: [
    "A good delivery service overall.",
    "Nearly perfect timing.",
    "A solid run of orders.",
    "We have mostly been in good hands.",
    "Happy to keep ordering.",
    "Brandon is doing a good job.",
    "A dependable choice with room to grow.",
    "Most of our deliveries went smoothly.",
    "The service is coming together.",
    "A little patience paid off.",
  ],
  3: [
    "The timing could be better.",
    "A mixed experience so far.",
    "Our deliveries need a steadier rhythm.",
    "We have had to be a little flexible.",
    "There is potential here.",
    "The orders arrived, eventually.",
    "Service has been a bit uneven.",
    "We are still finding our routine.",
    "Not quite the reliability we hoped for.",
    "We would love a smoother next round.",
  ],
  2: [
    "We have spent too long waiting.",
    "These delays are hard to work around.",
    "Our recent orders have been frustrating.",
    "We need more dependable timing.",
    "Delivery has become a concern.",
    "This has been a difficult stretch.",
    "The waiting is getting in the way.",
    "A lot of patience was needed.",
    "The schedule needs some attention.",
    "We cannot plan around delays like these.",
  ],
  1: [
    "We really need a change.",
    "Our recent experience has been disappointing.",
    "These waits are much too long.",
    "We need a delivery service we can rely on.",
    "This schedule is not working for us.",
    "We have been left waiting far too often.",
    "Our confidence has taken a knock.",
    "The delays have become unacceptable.",
    "We are struggling with the service.",
    "A serious improvement is needed.",
  ],
};
const CONTEXT = [
  "We plan our shelves around these orders.",
  "Pickles are a little thing that matters to our business.",
  "A regular delivery makes all the difference here.",
  "There is always another order on our list.",
  "Our team keeps an eye out for that familiar delivery.",
  "We are a small operation with a busy counter.",
  "Our menu has a permanent place for these jars.",
  "Keeping the pantry stocked is part of every day.",
  "We have built these orders into our routine.",
  "Good service matters as much as a good pickle.",
];
const ENDINGS = {
  5: [
    "Keep it up, Brandon!",
    "Same again next time, please.",
    "Consider us regulars.",
    "Five stars from our counter.",
    "We are glad to be part of the route.",
    "Our next order is already on our minds.",
    "Small business, big appreciation.",
    "Thank you for keeping us stocked.",
    "Looking forward to the next delivery.",
    "A very good day for a very good dill.",
  ],
  4: [
    "A little more consistency would make it perfect.",
    "We will happily try another round.",
    "Keep working on that timing.",
    "Just a little room for improvement.",
    "Looking forward to an even smoother next delivery.",
    "A good start to a lasting routine.",
    "We appreciate the effort.",
    "Almost a five-star experience.",
    "We are rooting for this little business.",
    "Let’s keep the orders moving.",
  ],
  3: [
    "Please tighten up the delivery schedule.",
    "We will give the next round a chance.",
    "Consistency would help us a lot.",
    "We hope things settle into a rhythm.",
    "A little sooner next time, please.",
    "We would like to worry less about the next order.",
    "We are keeping an eye on the timing.",
    "There is still room to win us over.",
    "A better routine would go a long way.",
    "Let’s make the next delivery easier.",
  ],
  2: [
    "Please make reliable delivery a priority.",
    "We need to see things improve.",
    "The next few orders will matter.",
    "We would like a reason to feel confident again.",
    "Please do better next time.",
    "A steadier service would really help.",
    "We hope the route gets some attention.",
    "Our patience is wearing thin.",
    "We cannot keep adjusting around late orders.",
    "We want this partnership to work.",
  ],
  1: [
    "Please sort out the route before taking on more.",
    "We cannot keep waiting like this.",
    "Reliability has to come first.",
    "We need a much better next delivery.",
    "This needs more than a small adjustment.",
    "Please give our orders some attention.",
    "We hope the service can turn around.",
    "We need to regain trust in the schedule.",
    "Our business needs a dependable supplier.",
    "The next chapter needs to be better.",
  ],
};
export const REVIEW_VARIANTS_PER_RATING = 1000;
export function deliveryRating(averageWait) {
  return averageWait <= 165
    ? 5
    : averageWait <= 240
      ? 4
      : averageWait <= 360
        ? 3
        : averageWait <= 600
          ? 2
          : 1;
}
export function reviewText(rating, variant) {
  const n = ((variant % 1000) + 1000) % 1000;
  return `${OPENINGS[rating][n % 10]} ${CONTEXT[Math.floor(n / 10) % 10]} ${ENDINGS[rating][Math.floor(n / 100)]}`;
}

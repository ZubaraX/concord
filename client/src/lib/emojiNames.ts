// Shortcode → emoji map for the `:name:` composer autocomplete. Curated to
// match the picker set plus the classic Discord/Slack codes people type from
// muscle memory. Names are searched by prefix first, then substring.
export const EMOJI_NAMES: Record<string, string> = {
  smile: "😄", grin: "😁", joy: "😂", rofl: "🤣", sweat_smile: "😅", laughing: "😆",
  slight_smile: "🙂", upside_down: "🙃", wink: "😉", blush: "😊", innocent: "😇",
  smiling_face_with_hearts: "🥰", heart_eyes: "😍", star_struck: "🤩", kiss: "😘",
  yum: "😋", stuck_out_tongue: "😛", stuck_out_tongue_winking_eye: "😜", zany: "🤪",
  hugging: "🤗", thinking: "🤔", shushing: "🤫", neutral_face: "😐", expressionless: "😑",
  no_mouth: "😶", rolling_eyes: "🙄", smirk: "😏", unamused: "😒", grimacing: "😬",
  lying_face: "🤥", relieved: "😌", pensive: "😔", sleepy: "😪", drooling: "🤤",
  sleeping: "😴", mask: "😷", thermometer_face: "🤒", head_bandage: "🤕", sneezing: "🤧",
  hot: "🥵", cold: "🥶", sunglasses: "😎", nerd: "🤓", monocle: "🧐", confused: "😕",
  worried: "😟", frowning: "🙁", open_mouth: "😮", hushed: "😯", astonished: "😲",
  flushed: "😳", pleading: "🥺", anguished: "😧", fearful: "😨", cold_sweat: "😰",
  cry: "😢", sob: "😭", scream: "😱", confounded: "😖", persevere: "😣",
  disappointed: "😞", sweat: "😓", weary: "😩", tired_face: "😫", yawning: "🥱",
  triumph: "😤", rage: "😡", angry: "😠", cursing: "🤬", smiling_imp: "😈",
  skull: "💀", poop: "💩", clown: "🤡", ghost: "👻", alien: "👽", robot: "🤖",
  jack_o_lantern: "🎃", smiley_cat: "😺", scream_cat: "🙀",
  thumbsup: "👍", thumbsdown: "👎", ok_hand: "👌", v: "✌️", crossed_fingers: "🤞",
  love_you: "🤟", metal: "🤘", point_left: "👈", point_right: "👉", point_up: "👆",
  point_down: "👇", raised_hand: "✋", vulcan: "🖖", wave: "👋", call_me: "🤙",
  muscle: "💪", pray: "🙏", writing_hand: "✍️", nail_care: "💅", clap: "👏",
  raised_hands: "🙌", open_hands: "👐", handshake: "🤝",
  heart: "❤️", orange_heart: "🧡", yellow_heart: "💛", green_heart: "💚",
  blue_heart: "💙", purple_heart: "💜", black_heart: "🖤", white_heart: "🤍",
  broken_heart: "💔", two_hearts: "💕", sparkling_heart: "💖", cupid: "💘",
  fire: "🔥", sparkles: "✨", star: "⭐", star2: "🌟", "100": "💯",
  white_check_mark: "✅", x: "❌", question: "❓", exclamation: "❗",
  speech_balloon: "💬", eyes: "👀", tada: "🎉", confetti_ball: "🎊",
  balloon: "🎈", gift: "🎁", trophy: "🏆", rocket: "🚀", bulb: "💡", zzz: "💤",
  wave_hand: "👋", facepalm: "🤦", shrug: "🤷", brain: "🧠", bomb: "💣",
  moneybag: "💰", gem: "💎", crown: "👑", dog: "🐶", cat: "🐱", pizza: "🍕",
  beer: "🍺", coffee: "☕", cake: "🎂", soccer: "⚽", gun: "🔫", warning: "⚠️",
  check: "✔️", plus1: "👍", minus1: "👎", ok: "🆗", new: "🆕", cool: "🆒",
};

/** Search shortcodes: prefix matches first, then substring matches. */
export function searchEmoji(q: string): Array<[string, string]> {
  const ql = q.toLowerCase();
  const starts: Array<[string, string]> = [];
  const contains: Array<[string, string]> = [];
  for (const [name, ch] of Object.entries(EMOJI_NAMES)) {
    if (name.startsWith(ql)) starts.push([name, ch]);
    else if (name.includes(ql)) contains.push([name, ch]);
  }
  return [...starts, ...contains];
}

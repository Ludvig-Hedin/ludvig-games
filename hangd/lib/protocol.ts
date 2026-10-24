export type Language = "sv" | "en";
export type Phase =
  | "lobby"
  | "choosing"
  | "countdown"
  | "playing"
  | "results"
  | "finished";
export type Sabotage = "bluff" | "panic" | "chaos" | "fog" | "double";
export interface Settings {
  rounds: number;
  roundSeconds: number;
  language: Language;
  difficulty: "easy" | "normal" | "hard";
  sabotage: boolean;
}
export interface PublicPlayer {
  id: string;
  nickname: string;
  avatar: number;
  score: number;
  connected: boolean;
  isHost: boolean;
  isMaster: boolean;
  solved: boolean;
  delta: number;
  streak: number;
  spectator: boolean;
  typingUntil: number;
  reaction?: string;
  reactionUntil: number;
  rematch: boolean;
}
export interface ChatMessage {
  id: string;
  playerId: string;
  nickname: string;
  text: string;
  at: number;
  system?: boolean;
}
export interface GameEvent {
  id: string;
  type: string;
  playerId?: string;
  text?: string;
  at: number;
}
export interface PublicEffects {
  chaosUntil: number;
  fogUntil: number;
  fogIndex: number;
  panicUntil: number;
  doubleUntil: number;
  doubleParticipants: string[];
  bluff?: {
    id: string;
    text: string;
    expiresAt: number;
    yourVote?: "truth" | "bluff";
    truth?: boolean;
  };
}
export interface RoundResult {
  answer: string;
  reason: "solved" | "time" | "mistakes" | "abandoned";
  winners: string[];
  deltas: Record<string, number>;
  funnyGuesses: { nickname: string; text: string }[];
  masterBonus: number;
}
export interface PublicRoom {
  code: string;
  version: number;
  phase: Phase;
  hostId: string;
  selfId: string;
  players: PublicPlayer[];
  settings: Settings;
  roundNo: number;
  masterId: string | null;
  deadlineAt: number;
  serverNow: number;
  maskedWord: string[];
  clue: string;
  guessedLetters: Record<string, { correct: boolean; playerId: string }>;
  mistakes: number;
  maxMistakes: number;
  effects: PublicEffects;
  usedCards: Sabotage[];
  cardsRemaining: number;
  cooldownUntil: number;
  chat: ChatMessage[];
  events: GameEvent[];
  result?: RoundResult;
  secretWord?: string;
  suggestions?: { word: string; clue: string }[];
  fullGuessAvailableAt: number;
  letterAvailableAt: number;
  canGuess: boolean;
  maxWordLength: number;
  rematchVotes: number;
}
export type GameAction =
  | { type: "settings"; settings: Partial<Settings> }
  | { type: "start" }
  | { type: "word"; word: string; clue: string }
  | { type: "letter"; letter: string }
  | { type: "solve"; word: string }
  | { type: "sabotage"; card: Sabotage; text?: string; truth?: boolean }
  | { type: "bluffVote"; vote: "truth" | "bluff" }
  | { type: "doubleAccept" }
  | { type: "chat"; text: string }
  | { type: "typing"; active: boolean }
  | { type: "reaction"; emoji: string }
  | { type: "next" }
  | { type: "rematch" }
  | { type: "leave" }
  | { type: "heartbeat" };
export interface ApiResponse {
  room: PublicRoom;
  token?: string;
  playerId?: string;
}
export const DEFAULT_SETTINGS: Settings = {
  rounds: 6,
  roundSeconds: 75,
  language: "sv",
  difficulty: "normal",
  sabotage: true,
};

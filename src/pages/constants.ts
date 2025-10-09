export const SCENES = ["bookstore", "coffee", "campus"] as const;
export type Scene = typeof SCENES[number];

export const DEFAULTS = {
  scene: "bookstore" as Scene,
  interlocutor: "neutral" as const,
};

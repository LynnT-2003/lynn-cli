import { client } from "../client.js";
import { Profile } from "../schema.js";

export const profileRepo = {
  async get(): Promise<Profile> {
    const data = await client.get();
    return data.profile;
  },
  
  async update(partial: Partial<Pick<Profile, "name" | "genres" | "favorites">>): Promise<void> {
    const data = await client.get();
    data.profile = {
      ...data.profile,
      ...partial,
      updatedAt: new Date().toISOString()
    };
    await client.save();
  },

  async completeOnboarding(name: string, genres: string[], favorites: number[]): Promise<void> {
    const data = await client.get();
    data.profile = {
      ...data.profile,
      name,
      genres,
      favorites,
      onboarded: true,
      updatedAt: new Date().toISOString()
    };
    await client.save();
  }
};

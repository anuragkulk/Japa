import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { serveSite } from "./adapter.mjs";
import { handleApp } from "./handler.mjs";
// Injected by the platform at deployment; never package a local _qoder dir.
import { storage } from "./_qoder/storage.mjs";

Deno.serve(
  serveSite((args: { request: Request; supabase: unknown }) => handleApp({ ...args, storage }), {
    createClient,
    env: (name: string) => Deno.env.get(name),
  }),
);

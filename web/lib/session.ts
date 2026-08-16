"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**Look into signInAnonymously as a replacement for this function
 * Note (08/14/26): Decided against anonymous users because it counts
 * towards MAU and can bloat the user table, when the main purpose is
 * only to log conversations. All messages already pass through the server
 * so better to log them there.
*/

export function useSession(){
  // Three scenarios: user is logged in, user is logged out (null), and unknown (undefined on first load)
  const [user, setUser] = useState<User | null | undefined>(undefined);
  
  // check user status after render
  useEffect(() => {
    const supabase = createClient();
    // fetch user status from supabase
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null))

    // subscribe to receive new values on sign in, sign out, or token refresh
    const { data } = supabase.auth.onAuthStateChange((_e, session) =>
      setUser(session?.user ?? null),
    );
    // unmount 
    return () => data.subscription.unsubscribe();
  }, []);

  return user
}  
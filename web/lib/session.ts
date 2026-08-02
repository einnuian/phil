"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

/**Look into signInAnonymously as a replacement for this function*/

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
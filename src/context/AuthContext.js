import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, setAuthCompanyId } from '../lib/supabase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load session on mount + subscribe to changes
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const { data } = await supabase.auth.getSession();
        if (!isMounted) return;
        setSession(data.session);
        if (data.session) {
          await loadProfile(data.session.user.id);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    init();

    // IMPORTANT: never await a supabase query inside onAuthStateChange —
    // supabase-js holds its auth lock while emitting, and a DB request needs
    // that same lock to attach the token. On a page refresh with a stored
    // session this deadlocked the whole app on the splash spinner. Deferring
    // with setTimeout(0) runs the query after the lock is released.
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!isMounted) return;
      setSession(newSession);
      if (newSession) {
        // Keep loading=true until the profile lands — releasing it earlier
        // makes the route gate think there's no company and bounces the user
        // to /onboarding for a split second (or for good).
        setTimeout(async () => {
          if (!isMounted) return;
          await loadProfile(newSession.user.id);
          if (isMounted) setLoading(false);
        }, 0);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  async function loadProfile(userId) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*, companies(id, name, slug, settings)')
        .eq('id', userId)
        .maybeSingle();
      if (error) {
        console.error('Profile load error:', error);
        return;
      }
      setProfile(data);
      setAuthCompanyId(data?.company_id || null);
    } catch (e) {
      console.error('Profile fetch failed:', e);
    }
  }

  async function signUp({ email, password, fullName }) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || '' },
      },
    });
    return { user: data?.user, error };
  }

  async function signIn({ email, password }) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    return { user: data?.user, error };
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }

  async function refreshProfile() {
    if (session?.user?.id) {
      await loadProfile(session.user.id);
    }
  }

  const companyId = profile?.company_id || null;
  const companyName = profile?.companies?.name || null;
  const isAuthenticated = !!session;
  const hasCompany = !!companyId;

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user || null,
        profile,
        companyId,
        companyName,
        loading,
        isAuthenticated,
        hasCompany,
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

import type { Session } from '@supabase/supabase-js';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase, restaurantSlug } from '@/lib/supabase';

type Access = {
  session: Session | null;
  loading: boolean;
  restaurantId: string | null;
  restaurantName: string;
  role: 'owner' | 'staff' | null;
  refreshAccess: () => Promise<void>;
};

const Ctx = createContext<Access>({
  session: null, loading: true, restaurantId: null,
  restaurantName: 'Krishna Dhaba', role: null,
  refreshAccess: async () => {}
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [restaurantName, setRestaurantName] = useState('Krishna Dhaba');
  const [role, setRole] = useState<'owner' | 'staff' | null>(null);

  const refreshAccess = async () => {
    const { data: auth } = await supabase.auth.getSession();
    const current = auth.session;
    setSession(current);
    if (!current) {
      setRestaurantId(null); setRole(null); setLoading(false); return;
    }
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants').select('id,name').eq('slug', restaurantSlug).maybeSingle();
    if (restaurantError || !restaurant) {
      setRestaurantId(null); setRole(null); setLoading(false); return;
    }
    const { data: membership, error: memberError } = await supabase
      .from('restaurant_staff').select('role')
      .eq('restaurant_id', restaurant.id).eq('user_id', current.user.id).maybeSingle();
    if (memberError || !membership) {
      setRestaurantId(null); setRole(null); setLoading(false); return;
    }
    setRestaurantId(restaurant.id);
    setRestaurantName(restaurant.name);
    setRole(membership.role as 'owner' | 'staff');
    setLoading(false);
  };

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      if (data.session) await refreshAccess();
      else setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) {
        setRestaurantId(null); setRole(null); setLoading(false);
      } else {
        setLoading(true);
        setTimeout(() => { void refreshAccess(); }, 0);
      }
    });
    return () => { mounted = false; listener.subscription.unsubscribe(); };
  }, []);

  return <Ctx.Provider value={{ session, loading, restaurantId, restaurantName, role, refreshAccess }}>{children}</Ctx.Provider>;
}
export const useAccess = () => useContext(Ctx);

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

interface Sub {
  table: string;
  filter?: string;
}

/**
 * Listens for database changes and calls onChange.
 * onChange is ALSO called every time the channel (re)connects, so after a network
 * drop the app re-reads the truth from the database instead of trusting stale state.
 */
export function useRealtime(name: string, subs: Sub[], onChange: () => void, enabled = true) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const subsKey = JSON.stringify(subs);

  useEffect(() => {
    if (!enabled) return;
    let channel = supabase.channel(name);
    for (const s of JSON.parse(subsKey) as Sub[]) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: s.table, ...(s.filter ? { filter: s.filter } : {}) },
        () => cb.current(),
      );
    }
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') cb.current();
    });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [name, subsKey, enabled]);
}

/** Mounted once, while signed in: keeps menu, settings and the customer's orders live. */
export function RealtimeSync({ userId, restaurantId }: { userId: string; restaurantId?: string }) {
  const qc = useQueryClient();

  useRealtime(
    `menu-${restaurantId}`,
    [
      { table: 'products', filter: `restaurant_id=eq.${restaurantId}` },
      { table: 'categories', filter: `restaurant_id=eq.${restaurantId}` },
      { table: 'restaurant_settings', filter: `restaurant_id=eq.${restaurantId}` },
    ],
    () => {
      qc.invalidateQueries({ queryKey: ['menu'] });
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['openNow'] });
      qc.invalidateQueries({ queryKey: ['cart-check'] });
      qc.invalidateQueries({ queryKey: ['product'] });
    },
    !!restaurantId,
  );

  useRealtime(
    `orders-${userId}`,
    [{ table: 'orders', filter: `customer_id=eq.${userId}` }],
    () => {
      qc.invalidateQueries({ queryKey: ['orders'] });
      qc.invalidateQueries({ queryKey: ['order'] });
    },
  );

  return null;
}

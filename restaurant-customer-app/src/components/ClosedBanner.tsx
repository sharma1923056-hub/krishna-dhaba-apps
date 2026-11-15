import { useStoreInfo } from '@/hooks/queries';
import { formatClock } from '@/lib/format';
import { Banner } from './StateViews';

/** Shown whenever the restaurant is not taking orders. Renders nothing when open. */
export function ClosedBanner() {
  const { restaurant, settings, isOpen, isLoading } = useStoreInfo();
  if (isLoading || !settings || isOpen) return null;
  const text = !settings.is_accepting_orders
    ? `${restaurant?.name ?? 'The restaurant'} is not accepting orders right now. You can still browse the menu.`
    : `We're closed right now. Orders open at ${formatClock(settings.opening_time)}.`;
  return <Banner kind="warning" text={text} />;
}

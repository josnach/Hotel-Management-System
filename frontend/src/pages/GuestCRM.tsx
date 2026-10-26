import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { PageHeader, Stat } from '@/components/common';
import { birthdayLabel } from '@/components/GuestCrmCard';
import { ListCard } from '@/components/DataTable';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useGet } from '@/lib/hooks';
import { d, money } from '@/lib/utils';

type Tab = 'all' | 'vip' | 'repeat' | 'blacklisted' | 'birthdays';
const TABS: [Tab, string][] = [['all', 'All guests'], ['vip', 'VIPs'], ['repeat', 'Repeat guests'], ['birthdays', 'Birthdays'], ['blacklisted', 'Blacklist']];

export default function GuestCRM() {
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState(''); const [page, setPage] = useState(1);
  const list = useGet<any>('/crm/guests', { filter: tab === 'birthdays' ? 'all' : tab, q, page }, tab !== 'birthdays');
  const bday = useGet<any[]>('/crm/birthdays', { days: 30 }, tab === 'birthdays');
  const vips = useGet<any>('/crm/guests', { filter: 'vip', page: 1 });
  const today = (bday.data ?? []).filter((b) => b.daysAway === 0);
  return (
    <>
      <PageHeader title="Guest CRM" subtitle="VIPs, repeat guests, birthdays and the blacklist" />
      <div className="mb-4 grid grid-cols-2 gap-3 md:max-w-xl"><Stat label="VIP guests" value={vips.data?.total ?? 0} /><Stat label="Birthdays today" value={bday.data ? today.length : '—'} /></div>
      <div className="mb-4 flex flex-wrap gap-2">{TABS.map(([k, l]) => <Button key={k} variant={tab === k ? 'default' : 'outline'} onClick={() => { setTab(k); setPage(1); }}>{l}</Button>)}</div>
      {tab !== 'birthdays' && (
        <>
          <Card className="mb-3 p-3"><div className="relative max-w-md"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search name, phone or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div></Card>
          <ListCard rows={list.data?.rows} loading={list.isLoading} error={list.error} empty="No guests match." cols={[
            { header: 'Guest', cell: (g: any) => <Link to={`/guests/${g.id}`} className="font-medium text-blue-700 underline">{g.name}</Link> },
            { header: '', cell: (g: any) => <div className="flex gap-1">{g.isVip && <Badge variant="yellow">VIP</Badge>}{g.isBlacklisted && <Badge variant="red">Blacklisted</Badge>}{g.visits > 1 && <Badge variant="blue">Repeat</Badge>}</div> },
            { header: 'Phone', cell: (g: any) => g.phone }, { header: 'Visits', cell: (g: any) => g.visits }, { header: 'Nights', cell: (g: any) => g.nights },
            { header: 'Total billed', cell: (g: any) => money(g.totalBilled) }, { header: 'Last stay', cell: (g: any) => (g.lastStay ? d(g.lastStay) : '—') },
            { header: 'Birthday', cell: (g: any) => birthdayLabel(g.birthMonth, g.birthDay) ?? '—' },
          ]} />
          <div className="mt-3 flex items-center justify-end gap-2 text-sm"><span className="text-muted-foreground">{list.data?.total ?? 0} guests</span>
            <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button size="sm" variant="outline" disabled={page * 20 >= (list.data?.total ?? 0)} onClick={() => setPage(page + 1)}>Next</Button></div>
        </>
      )}
      {tab === 'birthdays' && (
        <ListCard rows={bday.data} loading={bday.isLoading} error={bday.error} empty="No birthdays in the next 30 days." cols={[
          { header: 'When', cell: (b: any) => (b.daysAway === 0 ? <Badge variant="green">Today</Badge> : b.daysAway === 1 ? 'Tomorrow' : `In ${b.daysAway} days`) },
          { header: 'Guest', cell: (b: any) => <Link to={`/guests/${b.id}`} className="font-medium text-blue-700 underline">{b.name}</Link> },
          { header: '', cell: (b: any) => (b.isVip ? <Badge variant="yellow">VIP</Badge> : '') }, { header: 'Birthday', cell: (b: any) => birthdayLabel(b.birthMonth, b.birthDay) },
          { header: 'Phone', cell: (b: any) => b.phone }, { header: 'In house', cell: (b: any) => (b.inHouseRoom ? <Badge variant="blue">Room {b.inHouseRoom}</Badge> : '—') },
          { header: 'WhatsApp', cell: (b: any) => (b.whatsappOptIn ? 'Opted in' : '—') },
        ]} />
      )}
    </>
  );
}

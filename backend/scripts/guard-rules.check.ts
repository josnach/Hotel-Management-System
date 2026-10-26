/**
 * Revenue Guard rule checks. Pure functions, no database needed.
 * Run:  npm run check:guard
 */
import * as g from '../src/services/guard';

const t: g.Thresholds = { ...g.DEFAULTS };
let pass = 0, fail = 0;
const eq = (name: string, got: unknown, want: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(want); ok ? pass++ : (fail++, console.log('FAIL', name, '\n   got ', JSON.stringify(got), '\n   want', JSON.stringify(want))); };
const D = (s: string) => new Date(s);

// ── voids ──
const v = (o: any): any => ({ id: 'o1', orderNo: 'ORD-1', salesPoint: 'Main Restaurant', total: 25000, paymentMethod: 'CASH', isComplimentary: false, isStaffCredit: false,
  createdAt: D('2026-10-14T13:00:00'), voidedAt: D('2026-10-14T13:20:00'), voidReason: 'customer left', staffId: 'u1', staffName: 'ada', voidedById: 'u2', voidedByName: 'chi', ...o });
eq('void cash 25k same day', g.ruleVoid(v({}), t)?.severity, 'HIGH');
eq('void card 25k same day', g.ruleVoid(v({ paymentMethod: 'CARD' }), t)?.severity, 'MEDIUM');
eq('void cash 3k same day', g.ruleVoid(v({ total: 3000 }), t)?.severity, 'LOW');
eq('void cash 3k NEXT day bumps to MEDIUM', g.ruleVoid(v({ total: 3000, voidedAt: D('2026-10-15T09:00:00') }), t)?.severity, 'MEDIUM');
eq('void card 25k NEXT day bumps to HIGH', g.ruleVoid(v({ paymentMethod: 'CARD', voidedAt: D('2026-10-15T09:00:00') }), t)?.severity, 'HIGH');
eq('void staff-credit order ignored', g.ruleVoid(v({ paymentMethod: 'STAFF_CREDIT' }), t), null);
eq('void city-ledger ignored', g.ruleVoid(v({ paymentMethod: 'CITY_LEDGER' }), t), null);
eq('void room-charge ignored', g.ruleVoid(v({ paymentMethod: 'ROOM_CHARGE' }), t), null);
eq('void complimentary ignored', g.ruleVoid(v({ isComplimentary: true, total: 0 }), t), null);
eq('audit meta wasPaid=false overrides inference', g.ruleVoid(v({ wasPaid: false }), t), null);
eq('audit meta wasPaid=true overrides inference', g.ruleVoid(v({ paymentMethod: 'CITY_LEDGER', wasPaid: true }), t)?.type, 'VOID_PAID');
eq('void key + involved', [g.ruleVoid(v({}), t)?.key, g.ruleVoid(v({}), t)?.involved], ['VOID_PAID:o1', ['u1', 'u2']]);

// ── discounts ──
const s = (o: any): any => ({ id: 's1', room: '204', guest: 'Tunde Bello', checkInAt: D('2026-10-14T14:00:00'), expectedDeparture: D('2026-10-16T12:00:00'), nightlyRate: 40000,
  discountType: 'NONE', discountValue: 0, discountReason: null, isComplimentary: false, complimentaryReason: null, authorizedBy: null, staffId: 'u1', staffName: 'ada', ...o });
eq('10% discount not flagged', g.ruleDiscount(s({ discountType: 'PERCENTAGE', discountValue: 10, discountReason: 'regular', authorizedBy: 'MD' }), t), null);
eq('exactly 20% flagged MEDIUM w/ authorizer', g.ruleDiscount(s({ discountType: 'PERCENTAGE', discountValue: 20, discountReason: 'regular', authorizedBy: 'MD' }), t)?.severity, 'MEDIUM');
eq('20% no authorizer -> HIGH', g.ruleDiscount(s({ discountType: 'PERCENTAGE', discountValue: 20, discountReason: 'regular' }), t)?.severity, 'HIGH');
eq('45% even with authorizer -> HIGH', g.ruleDiscount(s({ discountType: 'PERCENTAGE', discountValue: 45, discountReason: 'x', authorizedBy: 'MD' }), t)?.severity, 'HIGH');
eq('fixed 30k w/ authorizer -> MEDIUM', g.ruleDiscount(s({ discountType: 'FIXED', discountValue: 30000, discountReason: 'x', authorizedBy: 'MD' }), t)?.severity, 'MEDIUM');
eq('fixed 50k (2.5x) -> HIGH', g.ruleDiscount(s({ discountType: 'FIXED', discountValue: 50000, discountReason: 'x', authorizedBy: 'MD' }), t)?.severity, 'HIGH');
eq('fixed 5k not flagged', g.ruleDiscount(s({ discountType: 'FIXED', discountValue: 5000, discountReason: 'x' }), t), null);
eq('25% of 2 nights x 40k = 20,000 estimate', g.ruleDiscount(s({ discountType: 'PERCENTAGE', discountValue: 25, discountReason: 'x', authorizedBy: 'MD' }), t)?.amount, 20000);
eq('discount rule skips complimentary stays', g.ruleDiscount(s({ discountType: 'PERCENTAGE', discountValue: 100, isComplimentary: true, complimentaryReason: 'VIP' }), t), null);

// ── complimentary ──
eq('comp stay w/o authorizer HIGH', g.ruleCompStay(s({ isComplimentary: true, complimentaryReason: 'VIP' }))?.severity, 'HIGH');
eq('comp stay w/ authorizer MEDIUM', g.ruleCompStay(s({ isComplimentary: true, complimentaryReason: 'VIP', authorizedBy: 'MD' }))?.severity, 'MEDIUM');
eq('comp stay value = 2 nights x 40k', g.ruleCompStay(s({ isComplimentary: true, complimentaryReason: 'VIP' }))?.amount, 80000);
eq('non-comp stay -> null', g.ruleCompStay(s({})), null);
const c = (o: any): any => ({ id: 'c1', orderNo: 'ORD-9', salesPoint: 'Pool Bar', subtotal: 5000, createdAt: D('2026-10-14T20:00:00'), staffId: 'u3', staffName: 'bola', ...o });
eq('comp order 5k LOW', g.ruleCompOrder(c({}), t)?.severity, 'LOW');
eq('comp order 20k MEDIUM', g.ruleCompOrder(c({ subtotal: 20000 }), t)?.severity, 'MEDIUM');
eq('comp order 0 -> null', g.ruleCompOrder(c({ subtotal: 0 }), t), null);

// ── stock adjustments ──
const a = (o: any): any => ({ id: 'a1', item: 'Heineken', delta: -10, costPrice: 900, reason: 'breakage', status: 'APPROVED', createdAt: D('2026-10-14T10:00:00'),
  requestedById: 'u4', requestedByName: 'kemi', approvedById: 'u5', approvedByName: 'dayo', ...o });
eq('small approved by other -> no flags', g.ruleAdjustment(a({}), t).map((f) => f.type), []);
eq('self-approved -> HIGH', g.ruleAdjustment(a({ approvedById: 'u4', approvedByName: 'kemi' }), t).map((f) => [f.type, f.severity]), [['ADJ_SELF_APPROVED', 'HIGH']]);
eq('large (24x1500=36k) -> MEDIUM', g.ruleAdjustment(a({ delta: -24, costPrice: 1500 }), t).map((f) => [f.type, f.severity]), [['ADJ_LARGE', 'MEDIUM']]);
eq('huge (>=5x threshold) -> HIGH', g.ruleAdjustment(a({ delta: -100, costPrice: 1500 }), t).map((f) => [f.type, f.severity]), [['ADJ_LARGE', 'HIGH']]);
eq('self-approved AND large -> both', g.ruleAdjustment(a({ delta: -24, costPrice: 1500, approvedById: 'u4' }), t).map((f) => f.type).sort(), ['ADJ_LARGE', 'ADJ_SELF_APPROVED']);
eq('stock increase ignored', g.ruleAdjustment(a({ delta: 50 }), t), []);
eq('rejected ignored', g.ruleAdjustment(a({ status: 'REJECTED', costPrice: 9999 }), t), []);
eq('pending large still flagged', g.ruleAdjustment(a({ status: 'PENDING', approvedById: null, approvedByName: null, delta: -24, costPrice: 1500 }), t).map((f) => f.type), ['ADJ_LARGE']);

// ── open folios + aged orders ──
const now = D('2026-10-16T12:00:00');
const f = (o: any): any => ({ id: 'f1', folioNo: 'F1', guest: 'Ngozi Eze', room: '110', balance: 45000, checkedOutAt: D('2026-10-11T11:00:00'), isGroup: false, staffId: 'u1', staffName: 'ada', ...o });
eq('folio zero balance null', g.ruleOpenFolio(f({ balance: 0 }), now), null);
eq('folio 5 days MEDIUM', g.ruleOpenFolio(f({}), now)?.severity, 'MEDIUM');
eq('folio 20 days HIGH', g.ruleOpenFolio(f({ checkedOutAt: D('2026-09-26T11:00:00') }), now)?.severity, 'HIGH');
eq('group folio LOW', g.ruleOpenFolio(f({ isGroup: true, checkedOutAt: D('2026-09-01T11:00:00') }), now)?.severity, 'LOW');
const o = (x: any): any => ({ id: 'o9', orderNo: 'ORD-77', salesPoint: 'Main Restaurant', total: 8000, createdAt: D('2026-10-11T12:00:00'), isStaffCredit: true, customer: 'staff', staffId: 'u1', staffName: 'ada', ...x });
eq('aged 5d MEDIUM', g.ruleAgedOrder(o({}), now)?.severity, 'MEDIUM');
eq('aged 20d HIGH', g.ruleAgedOrder(o({ createdAt: D('2026-09-26T12:00:00') }), now)?.severity, 'HIGH');
eq('aged zero-total null', g.ruleAgedOrder(o({ total: 0 }), now), null);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

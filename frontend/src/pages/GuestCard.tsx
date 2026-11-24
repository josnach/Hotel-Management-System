import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Printer, X } from 'lucide-react';

type GuestCardState = {
  guest?: {
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    nationality?: string | null;
    idType?: string | null;
    idNumber?: string | null;
  };
  registrationDetails?: {
    placeOfIssue?: string;
    purposeOfVisit?: string;
    vehicleRegistration?: string;
    emergencyContactName?: string;
    emergencyContactPhone?: string;
    emergencyContactRelationship?: string;
  };
  expectedStay?: string;
  roomNumber?: string;
  staffName?: string;
  specialRequests?: string;
};

function CardField({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="min-h-7 break-words border-b border-slate-300 px-1 py-1 text-sm text-slate-800">
        {value?.trim() || '—'}
      </div>
    </div>
  );
}

function CardSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-5 break-inside-avoid">
      <h2 className="mb-3 border-b border-slate-300 pb-2 text-xs font-bold uppercase tracking-wider text-slate-800">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function GuestCard() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = (location.state ?? {}) as GuestCardState;

  const guest = state.guest ?? {};
  const details = state.registrationDetails ?? {};
  const guestName = [guest.firstName, guest.lastName]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-8">
      <style>{`
        @page {
          size: A4;
          margin: 12mm;
        }

        @media print {
          body {
            background: white !important;
          }

          .guest-card-screen {
            min-height: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          .guest-card-paper {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            border: 0 !important;
            box-shadow: none !important;
          }

          .guest-card-actions {
            display: none !important;
          }

          .guest-card-paper section {
            break-inside: avoid;
          }
        }
      `}</style>

      <div className="guest-card-screen mx-auto flex min-h-[calc(100vh-4rem)] flex-col items-center">
        <article className="guest-card-paper w-full max-w-4xl border border-slate-200 bg-white px-8 py-8 shadow-sm sm:px-12">
          <header className="mb-7 border-b-2 border-slate-800 pb-5 text-center">
            <h1 className="text-2xl font-extrabold tracking-[0.16em] text-slate-900">
              KORAF HOTELS
            </h1>
            <p className="mt-2 text-sm font-bold uppercase tracking-[0.2em] text-slate-700">
              Guest Registration Card
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Guest Information and Registration
            </p>
          </header>

          <CardSection title="Guest Information">
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <CardField label="Guest Full Name" value={guestName} />
              <CardField label="Phone Number" value={guest.phone} />
              <CardField label="Email Address" value={guest.email} />
              <CardField label="Nationality" value={guest.nationality} />
              <div className="sm:col-span-2">
                <CardField label="Residential Address" value={guest.address} />
              </div>
            </div>
          </CardSection>

          <CardSection title="Identification">
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <CardField label="ID Type" value={guest.idType} />
              <CardField label="ID Number" value={guest.idNumber} />
              <CardField
                label="Place of Issue"
                value={details.placeOfIssue}
              />
            </div>
          </CardSection>

          <CardSection title="Stay Details">
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <CardField label="Room Number" value={state.roomNumber} />
              <CardField label="Expected Length of Stay" value={state.expectedStay} />
              <CardField
                label="Purpose of Visit"
                value={details.purposeOfVisit}
              />
              <CardField
                label="Vehicle Registration"
                value={details.vehicleRegistration}
              />
            </div>
          </CardSection>

          <CardSection title="Emergency Contact">
            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
              <CardField
                label="Contact Name"
                value={details.emergencyContactName}
              />
              <CardField
                label="Contact Phone"
                value={details.emergencyContactPhone}
              />
              <CardField
                label="Relationship"
                value={details.emergencyContactRelationship}
              />
            </div>
          </CardSection>

          <CardSection title="Special Requests">
            <div className="min-h-12 whitespace-pre-wrap border-b border-slate-300 px-1 py-1 text-sm text-slate-800">
              {state.specialRequests?.trim() || '—'}
            </div>
          </CardSection>

          <CardSection title="Declaration">
            <p className="text-sm leading-6 text-slate-700">
              I confirm that the information provided is true and complete. I
              agree to abide by the hotel's terms and conditions.
            </p>

            <div className="mt-7 grid grid-cols-2 gap-8">
              <div>
                <div className="h-8 border-b border-slate-400" />
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Guest Signature
                </p>
              </div>
              <div>
                <div className="h-8 border-b border-slate-400" />
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  Date
                </p>
              </div>
            </div>
          </CardSection>

          <section className="break-inside-avoid border-t-2 border-dashed border-slate-400 pt-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
              For Official Use Only
            </h2>
            <p className="mb-4 mt-1 text-xs text-slate-500">
              Front Desk Staff
            </p>

            <div className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-3">
              <CardField label="Room No." value={state.roomNumber} />
              <CardField label="Staff Name" value={state.staffName} />
              <CardField
                label="Date"
                value={new Date().toLocaleDateString()}
              />
            </div>
          </section>
        </article>

        <div className="guest-card-actions mt-6 flex w-full max-w-4xl justify-end gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Printer size={17} />
            Print Registration Card
          </button>

          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-300"
          >
            <X size={17} />
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

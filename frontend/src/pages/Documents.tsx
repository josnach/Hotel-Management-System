
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  FileText,
  Download,
  Trash2,
  Upload,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { toast } from 'sonner';

import { tokenStore } from '@/lib/api';

type DocumentCategory =
  | 'GUEST_ID'
  | 'PASSPORT'
  | 'SIGNED_AGREEMENT'
  | 'CONTRACT'
  | 'OTHER';

type GuestOption = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
};

type GuestDocument = {
  id: string;
  guestId: string;
  uploadedById: string | null;
  category: DocumentCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  notes: string | null;
  createdAt: string;
  uploadedBy?: {
    id: string;
    fullName: string | null;
    username: string;
  } | null;
};

type DocumentsResponse = {
  documents: GuestDocument[];
};

const CATEGORIES: { value: DocumentCategory; label: string }[] = [
  { value: 'GUEST_ID', label: 'Guest ID' },
  { value: 'PASSPORT', label: 'Passport' },
  { value: 'SIGNED_AGREEMENT', label: 'Signed agreement' },
  { value: 'CONTRACT', label: 'Contract' },
  { value: 'OTHER', label: 'Other' },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024;

async function request<T>(
  url: string,
  init: RequestInit = {},
): Promise<T> {
  const token = tokenStore.get();

  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init.body instanceof FormData
        ? {}
        : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;

    try {
      const body = await response.json();
      message = body.message || body.error || message;
    } catch {
      // Keep the HTTP status message.
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatCategory(category: DocumentCategory): string {
  return CATEGORIES.find((item) => item.value === category)?.label ?? category;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function guestName(guest: GuestOption): string {
  return `${guest.firstName} ${guest.lastName}`.trim();
}

export default function Documents() {
  const [selectedGuest, setSelectedGuest] = useState<GuestOption | null>(null);
  const [searchText, setSearchText] = useState('');
  const [guestResults, setGuestResults] = useState<GuestOption[]>([]);
  const [searchingGuests, setSearchingGuests] = useState(false);
  const [showGuestResults, setShowGuestResults] = useState(false);

  const [documents, setDocuments] = useState<GuestDocument[]>([]);
  const [category, setCategory] = useState<DocumentCategory>('GUEST_ID');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);

  // Keep support for links such as /documents?guestId=DATABASE_ID.
  useEffect(() => {
    const guestId = new URLSearchParams(window.location.search).get('guestId');
    if (!guestId) return;

    let cancelled = false;

    void request<GuestOption>(`/api/guests/${encodeURIComponent(guestId)}`)
      .then((guest) => {
        if (cancelled) return;
        setSelectedGuest(guest);
        setSearchText(`${guestName(guest)} — ${guest.phone}`);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(
            error instanceof Error ? error.message : 'Unable to load guest',
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Search guests as the user types. The timer avoids sending a request
  // for every keystroke.
  useEffect(() => {
    const query = searchText.trim();

    if (selectedGuest || query.length < 2) {
      setGuestResults([]);
      setSearchingGuests(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const timer = window.setTimeout(async () => {
      setSearchingGuests(true);

      try {
        const results = await request<GuestOption[]>(
          `/api/guests/search?q=${encodeURIComponent(query)}`,
          { signal: controller.signal },
        );

        if (!cancelled) {
          setGuestResults(Array.isArray(results) ? results : []);
          setShowGuestResults(true);
        }
      } catch (error) {
        if (!cancelled && !(error instanceof DOMException && error.name === 'AbortError')) {
          toast.error(
            error instanceof Error ? error.message : 'Guest search failed',
          );
        }
      } finally {
        if (!cancelled) setSearchingGuests(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [searchText, selectedGuest]);

  const guestId = selectedGuest?.id ?? '';

  const loadDocuments = useCallback(async () => {
    if (!guestId) {
      setDocuments([]);
      return;
    }

    setLoading(true);

    try {
      const query = new URLSearchParams({ guestId });
      const response = await request<DocumentsResponse>(
        `/api/documents?${query.toString()}`,
      );

      setDocuments(response.documents);
    } catch (error) {
      setDocuments([]);
      toast.error(
        error instanceof Error ? error.message : 'Unable to load documents',
      );
    } finally {
      setLoading(false);
    }
  }, [guestId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  function selectGuest(guest: GuestOption) {
    setSelectedGuest(guest);
    setSearchText(`${guestName(guest)} — ${guest.phone}`);
    setGuestResults([]);
    setShowGuestResults(false);
    setDocuments([]);
  }

  function clearGuest() {
    setSelectedGuest(null);
    setSearchText('');
    setGuestResults([]);
    setDocuments([]);
    setShowGuestResults(false);
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!guestId) {
      toast.error('Search for and select a guest first');
      return;
    }

    if (!file) {
      toast.error('Choose a document to upload');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      toast.error('The maximum file size is 10 MB');
      return;
    }

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];

    if (!allowedTypes.includes(file.type)) {
      toast.error('Only PDF, JPEG, and PNG files are allowed');
      return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('guestId', guestId);
    formData.append('category', category);
    formData.append('notes', notes.trim());

    setUploading(true);

    try {
      await request<{ document: GuestDocument }>('/api/documents', {
        method: 'POST',
        body: formData,
      });

      toast.success('Document uploaded successfully');
      setFile(null);
      setNotes('');

      const fileInput = document.getElementById(
        'guest-document-file',
      ) as HTMLInputElement | null;

      if (fileInput) fileInput.value = '';

      await loadDocuments();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to upload document',
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDownload(item: GuestDocument) {
    setBusyDocumentId(item.id);

    try {
      const token = tokenStore.get();
      const response = await fetch(
        `/api/documents/${encodeURIComponent(item.id)}/download`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );

      if (!response.ok) {
        let message = `Download failed (${response.status})`;

        try {
          const body = await response.json();
          message = body.message || body.error || message;
        } catch {
          // Keep the status message.
        }

        throw new Error(message);
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');

      anchor.href = objectUrl;
      anchor.download = item.originalName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to download document',
      );
    } finally {
      setBusyDocumentId(null);
    }
  }

  async function handleDelete(item: GuestDocument) {
    if (!window.confirm(`Delete "${item.originalName}"? This cannot be undone.`)) {
      return;
    }

    setBusyDocumentId(item.id);

    try {
      await request<{ ok: boolean }>(
        `/api/documents/${encodeURIComponent(item.id)}`,
        { method: 'DELETE' },
      );

      setDocuments((current) =>
        current.filter((document) => document.id !== item.id),
      );

      toast.success('Document deleted');
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Unable to delete document',
      );
    } finally {
      setBusyDocumentId(null);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Guest Documents</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Securely manage guest identification, agreements, and contracts.
        </p>
      </div>

      <section className="rounded-lg border bg-card p-4 md:p-6">
        <h2 className="mb-4 text-lg font-medium">Select guest</h2>

        <div className="relative">
          <label className="mb-2 block text-sm font-medium" htmlFor="guest-search">
            Search by guest name or phone number
          </label>

          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search
                size={17}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                id="guest-search"
                className="min-h-10 w-full rounded-md border bg-background py-2 pl-9 pr-3 text-sm"
                value={searchText}
                onChange={(event) => {
                  if (selectedGuest) setSelectedGuest(null);
                  setDocuments([]);
                  setSearchText(event.target.value);
                  setShowGuestResults(true);
                }}
                onFocus={() => {
                  if (!selectedGuest && searchText.trim().length >= 2) {
                    setShowGuestResults(true);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setShowGuestResults(false);
                }}
                placeholder="Enter a guest name or phone number"
                autoComplete="off"
                aria-label="Search guests"
                aria-expanded={showGuestResults && !selectedGuest}
                aria-controls="guest-search-results"
              />
            </div>

            {selectedGuest && (
              <button
                type="button"
                className="inline-flex min-h-10 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted"
                onClick={clearGuest}
                aria-label="Clear selected guest"
              >
                <X size={16} />
                Clear
              </button>
            )}
          </div>

          {selectedGuest && (
            <p className="mt-2 text-sm text-muted-foreground">
              Selected: <strong>{guestName(selectedGuest)}</strong>
              {' · '}{selectedGuest.phone}
            </p>
          )}

          {showGuestResults && !selectedGuest && searchText.trim().length >= 2 && (
            <div
              id="guest-search-results"
              className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md"
            >
              {searchingGuests ? (
                <p className="p-3 text-sm text-muted-foreground">Searching guests…</p>
              ) : guestResults.length > 0 ? (
                guestResults.map((guest) => (
                  <button
                    type="button"
                    key={guest.id}
                    className="flex w-full flex-col items-start gap-1 border-b px-3 py-3 text-left last:border-b-0 hover:bg-muted"
                    onClick={() => selectGuest(guest)}
                  >
                    <span className="font-medium">{guestName(guest)}</span>
                    <span className="text-sm text-muted-foreground">
                      {guest.phone}
                      {guest.email ? ` · ${guest.email}` : ''}
                    </span>
                  </button>
                ))
              ) : (
                <p className="p-3 text-sm text-muted-foreground">
                  No matching guests found.
                </p>
              )}
            </div>
          )}
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Select a result before uploading or viewing documents.
        </p>
      </section>

      <section className="rounded-lg border bg-card p-4 md:p-6">
        <h2 className="mb-4 text-lg font-medium">Upload a document</h2>

        <form className="space-y-4" onSubmit={handleUpload}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="document-category">
                Document category
              </label>
              <select
                id="document-category"
                className="min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as DocumentCategory)
                }
              >
                {CATEGORIES.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="guest-document-file">
                File (PDF, JPEG, or PNG)
              </label>
              <input
                id="guest-document-file"
                className="block min-h-10 w-full rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
              <p className="text-xs text-muted-foreground">Maximum size: 10 MB.</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="document-notes">
              Notes (optional)
            </label>
            <textarea
              id="document-notes"
              className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              maxLength={1000}
              placeholder="Add a short note about this document"
            />
          </div>

          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            type="submit"
            disabled={uploading || !selectedGuest || !file}
          >
            <Upload size={16} />
            {uploading ? 'Uploading…' : 'Upload document'}
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="flex flex-col gap-2 border-b p-4 sm:flex-row sm:items-center sm:justify-between md:p-6">
          <div>
            <h2 className="text-lg font-medium">Stored documents</h2>
            <p className="text-sm text-muted-foreground">
              {selectedGuest
                ? `${documents.length} document(s) for ${guestName(selectedGuest)}`
                : 'Select a guest to view documents'}
            </p>
          </div>

          <button
            type="button"
            className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
            onClick={() => void loadDocuments()}
            disabled={!selectedGuest || loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {!selectedGuest ? (
          <div className="p-8 text-center">
            <FileText className="mx-auto mb-3 text-muted-foreground" size={32} />
            <p className="font-medium">Select a guest</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Search for a guest above to view or upload documents.
            </p>
          </div>
        ) : loading ? (
          <p className="p-6 text-sm text-muted-foreground">Loading documents…</p>
        ) : documents.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="mx-auto mb-3 text-muted-foreground" size={32} />
            <p className="font-medium">No documents found</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Upload a document for this guest to see it here.
            </p>
          </div>
        ) : (
          <div className="divide-y">
            {documents.map((item) => (
              <article
                key={item.id}
                className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between md:px-6"
              >
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <FileText size={20} />
                  </div>

                  <div className="min-w-0">
                    <p className="break-words font-medium">{item.originalName}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {formatCategory(item.category)} · {formatBytes(item.sizeBytes)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Uploaded {formatDate(item.createdAt)}
                      {item.uploadedBy?.fullName
                        ? ` by ${item.uploadedBy.fullName}`
                        : ''}
                    </p>
                    {item.notes && (
                      <p className="mt-2 break-words text-sm">{item.notes}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                    onClick={() => void handleDownload(item)}
                    disabled={busyDocumentId === item.id}
                  >
                    <Download size={15} />
                    Download
                  </button>

                  <button
                    type="button"
                    className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
                    onClick={() => void handleDelete(item)}
                    disabled={busyDocumentId === item.id}
                    title="Deletion requires administrator or manager access"
                  >
                    <Trash2 size={15} />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}


import { api } from '@/lib/api';
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

type Currency = {
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  isActive: boolean;
};

type FxRate = {
  id: string;
  fromCurrencyCode: string;
  toCurrencyCode: string;
  rate: string;
  effectiveFrom: string;
  createdAt: string;
  createdById?: string | null;
  reason?: string | null;
  fromCurrency: Currency;
  toCurrency: Currency;
};

type CurrencyResponse = {
  currencies: Currency[];
  baseCurrency: string;
};

type RatesResponse = {
  rates: FxRate[];
};

type ApiError = {
  response?: {
    data?: {
      error?: string;
      message?: string;
    };
  };
  message?: string;
};

function errorMessage(error: unknown): string {
  const apiError = error as ApiError;

  return (
    apiError.response?.data?.error ||
    apiError.response?.data?.message ||
    apiError.message ||
    'Something went wrong. Please try again.'
  );
}

function formatDate(value: string): string {
  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString();
}

export default function CurrencyManagement() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('NGN');
  const [rates, setRates] = useState<FxRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [savingRate, setSavingRate] = useState(false);

  const [currencyForm, setCurrencyForm] = useState({
    code: '',
    name: '',
    symbol: '',
    decimalPlaces: '2',
  });

  const [rateForm, setRateForm] = useState({
    fromCurrencyCode: '',
    toCurrencyCode: '',
    rate: '',
    effectiveFrom: '',
    reason: '',
  });

  const activeCurrencies = useMemo(
    () => currencies.filter((currency) => currency.isActive),
    [currencies],
  );

  const sortedRates = useMemo(
    () =>
      [...rates].sort(
        (a, b) =>
          new Date(b.effectiveFrom).getTime() -
          new Date(a.effectiveFrom).getTime(),
      ),
    [rates],
  );

  const loadData = useCallback(async () => {
    setLoading(true);

    try {
      const [currencyResponse, rateResponse] = await Promise.all([
        api.get<CurrencyResponse>('/currencies'),
        api.get<RatesResponse>('/currencies/rates'),
      ]);

      // The existing API helper returns the response body directly.
      const loadedCurrencies = currencyResponse.currencies ?? [];
      const loadedRates = rateResponse.rates ?? [];
      const loadedBaseCurrency = currencyResponse.baseCurrency ?? 'NGN';

      setCurrencies(loadedCurrencies);
      setRates(loadedRates);
      setBaseCurrency(loadedBaseCurrency);

      const activeCodes = loadedCurrencies
        .filter((currency) => currency.isActive)
        .map((currency) => currency.code);

      setRateForm((current) => {
        const currentFromIsValid =
          activeCodes.includes(current.fromCurrencyCode) &&
          current.fromCurrencyCode !== current.toCurrencyCode;

        const fromCurrencyCode = currentFromIsValid
          ? current.fromCurrencyCode
          : activeCodes.find(
              (code) =>
                code !== current.toCurrencyCode &&
                code !== loadedBaseCurrency,
            ) ??
            activeCodes.find(
              (code) => code !== current.toCurrencyCode,
            ) ??
            '';

        const currentToIsValid =
          activeCodes.includes(current.toCurrencyCode) &&
          current.toCurrencyCode !== fromCurrencyCode;

        const toCurrencyCode = currentToIsValid
          ? current.toCurrencyCode
          : activeCodes.find(
              (code) =>
                code !== fromCurrencyCode &&
                code === loadedBaseCurrency,
            ) ??
            activeCodes.find((code) => code !== fromCurrencyCode) ??
            '';

        return {
          ...current,
          fromCurrencyCode,
          toCurrencyCode,
        };
      });
    } catch (error) {
      console.error('Failed to load currency management data:', error);
      toast.error(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function handleFromCurrencyChange(code: string) {
    setRateForm((current) => {
      const replacementTo =
        code === current.toCurrencyCode
          ? activeCurrencies.find(
              (currency) => currency.code !== code,
            )?.code ?? ''
          : current.toCurrencyCode;

      return {
        ...current,
        fromCurrencyCode: code,
        toCurrencyCode: replacementTo,
      };
    });
  }

  function handleToCurrencyChange(code: string) {
    setRateForm((current) => {
      const replacementFrom =
        code === current.fromCurrencyCode
          ? activeCurrencies.find(
              (currency) => currency.code !== code,
            )?.code ?? ''
          : current.fromCurrencyCode;

      return {
        ...current,
        fromCurrencyCode: replacementFrom,
        toCurrencyCode: code,
      };
    });
  }

  async function handleCreateCurrency(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const code = currencyForm.code.trim().toUpperCase();
    const name = currencyForm.name.trim();
    const symbol = currencyForm.symbol.trim();
    const decimalPlaces = Number(currencyForm.decimalPlaces);

    if (!/^[A-Z]{3}$/.test(code)) {
      toast.error('Enter a valid three-letter currency code.');
      return;
    }

    if (name.length < 2) {
      toast.error('Enter a valid currency name.');
      return;
    }

    if (!symbol || symbol.length > 10) {
      toast.error('Enter a valid currency symbol.');
      return;
    }

    if (![0, 2, 3, 4].includes(decimalPlaces)) {
      toast.error('Select a valid number of decimal places.');
      return;
    }

    setSavingCurrency(true);

    try {
      await api.post('/currencies', {
        code,
        name,
        symbol,
        decimalPlaces,
      });

      toast.success(`${code} currency created.`);

      setCurrencyForm({
        code: '',
        name: '',
        symbol: '',
        decimalPlaces: '2',
      });

      await loadData();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingCurrency(false);
    }
  }

  async function handleCreateRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const fromCurrencyCode = rateForm.fromCurrencyCode;
    const toCurrencyCode = rateForm.toCurrencyCode;
    const normalizedRate = rateForm.rate.trim();

    if (!fromCurrencyCode || !toCurrencyCode) {
      toast.error('Select both currencies.');
      return;
    }

    if (fromCurrencyCode === toCurrencyCode) {
      toast.error('Select two different currencies.');
      return;
    }

    if (
      !activeCurrencies.some(
        (currency) => currency.code === fromCurrencyCode,
      ) ||
      !activeCurrencies.some(
        (currency) => currency.code === toCurrencyCode,
      )
    ) {
      toast.error('Select two active currencies.');
      return;
    }

    if (!/^\d{1,10}(\.\d{1,10})?$/.test(normalizedRate)) {
      toast.error(
        'Enter a positive exchange rate with up to 10 decimal places.',
      );
      return;
    }

    if (!/[1-9]/.test(normalizedRate)) {
      toast.error('The exchange rate must be greater than zero.');
      return;
    }

    let effectiveFrom: string | undefined;

    if (rateForm.effectiveFrom) {
      const parsedDate = new Date(rateForm.effectiveFrom);

      if (Number.isNaN(parsedDate.getTime())) {
        toast.error('Enter a valid effective date.');
        return;
      }

      effectiveFrom = parsedDate.toISOString();
    }

    setSavingRate(true);

    try {
      await api.post('/currencies/rates', {
        fromCurrencyCode,
        toCurrencyCode,
        // Send the rate as a string to preserve decimal precision.
        rate: normalizedRate,
        ...(effectiveFrom ? { effectiveFrom } : {}),
        reason: rateForm.reason.trim() || undefined,
      });

      toast.success('Exchange rate recorded.');

      setRateForm((current) => ({
        ...current,
        rate: '',
        effectiveFrom: '',
        reason: '',
      }));

      await loadData();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSavingRate(false);
    }
  }

  return (
    <main className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Currency Management
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage supported currencies and effective-dated exchange rates.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          disabled={loading}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>

      <section className="rounded-xl border p-5">
        <p className="text-sm text-muted-foreground">Base currency</p>

        <div className="mt-1 flex items-center gap-3">
          <span className="text-2xl font-bold">{baseCurrency}</span>
          <span className="rounded-full border px-2 py-1 text-xs">
            Reporting currency
          </span>
        </div>

        <p className="mt-2 text-sm text-muted-foreground">
          Recording a new exchange rate does not automatically convert
          historical transactions or change the base currency.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="rounded-xl border p-5">
          <h2 className="text-lg font-semibold">Add currency</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            Register a three-letter currency code.
          </p>

          <form onSubmit={handleCreateCurrency} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                Currency code
                <input
                  required
                  minLength={3}
                  maxLength={3}
                  pattern="[A-Za-z]{3}"
                  value={currencyForm.code}
                  onChange={(event) =>
                    setCurrencyForm((current) => ({
                      ...current,
                      code: event.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="USD"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                />
              </label>

              <label className="block text-sm font-medium">
                Currency name
                <input
                  required
                  minLength={2}
                  maxLength={100}
                  value={currencyForm.name}
                  onChange={(event) =>
                    setCurrencyForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="US Dollar"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                />
              </label>

              <label className="block text-sm font-medium">
                Symbol
                <input
                  required
                  maxLength={10}
                  value={currencyForm.symbol}
                  onChange={(event) =>
                    setCurrencyForm((current) => ({
                      ...current,
                      symbol: event.target.value,
                    }))
                  }
                  placeholder="$"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                />
              </label>

              <label className="block text-sm font-medium">
                Decimal places
                <select
                  value={currencyForm.decimalPlaces}
                  onChange={(event) =>
                    setCurrencyForm((current) => ({
                      ...current,
                      decimalPlaces: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="0">0</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </label>
            </div>

            <button
              type="submit"
              disabled={savingCurrency}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {savingCurrency ? 'Saving...' : 'Add currency'}
            </button>
          </form>
        </section>

        <section className="rounded-xl border p-5">
          <h2 className="text-lg font-semibold">Record exchange rate</h2>
          <p className="mb-4 mt-1 text-sm text-muted-foreground">
            One unit of the source currency equals the entered amount in
            the target currency.
          </p>

          <form onSubmit={handleCreateRate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block text-sm font-medium">
                From currency
                <select
                  required
                  value={rateForm.fromCurrencyCode}
                  onChange={(event) =>
                    handleFromCurrencyChange(event.target.value)
                  }
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">Select currency</option>
                  {activeCurrencies.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} — {currency.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium">
                To currency
                <select
                  required
                  value={rateForm.toCurrencyCode}
                  onChange={(event) =>
                    handleToCurrencyChange(event.target.value)
                  }
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                >
                  <option value="">Select currency</option>
                  {activeCurrencies.map((currency) => (
                    <option key={currency.code} value={currency.code}>
                      {currency.code} — {currency.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block text-sm font-medium sm:col-span-2">
                Exchange rate
                <input
                  required
                  inputMode="decimal"
                  pattern="[0-9]+([.][0-9]+)?"
                  value={rateForm.rate}
                  onChange={(event) =>
                    setRateForm((current) => ({
                      ...current,
                      rate: event.target.value,
                    }))
                  }
                  placeholder="Enter approved rate"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                />
              </label>

              <label className="block text-sm font-medium sm:col-span-2">
                Effective from (optional)
                <input
                  type="datetime-local"
                  value={rateForm.effectiveFrom}
                  onChange={(event) =>
                    setRateForm((current) => ({
                      ...current,
                      effectiveFrom: event.target.value,
                    }))
                  }
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                />
                <span className="mt-1 block text-xs font-normal text-muted-foreground">
                  Leave blank to use the current time.
                </span>
              </label>

              <label className="block text-sm font-medium sm:col-span-2">
                Reason or source
                <textarea
                  rows={2}
                  maxLength={500}
                  value={rateForm.reason}
                  onChange={(event) =>
                    setRateForm((current) => ({
                      ...current,
                      reason: event.target.value,
                    }))
                  }
                  placeholder="Approved rate source or reference"
                  className="mt-1 w-full rounded-md border bg-background px-3 py-2"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={
                savingRate ||
                activeCurrencies.length < 2 ||
                !rateForm.fromCurrencyCode ||
                !rateForm.toCurrencyCode ||
                rateForm.fromCurrencyCode === rateForm.toCurrencyCode
              }
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {savingRate ? 'Saving...' : 'Record rate'}
            </button>

            {activeCurrencies.length < 2 && (
              <p className="text-sm text-muted-foreground">
                Add at least two active currencies before recording an
                exchange rate.
              </p>
            )}
          </form>
        </section>
      </div>

      <section className="rounded-xl border">
        <div className="border-b p-5">
          <h2 className="text-lg font-semibold">Active currencies</h2>
        </div>

        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">
            Loading currencies...
          </p>
        ) : activeCurrencies.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No active currencies were returned by the server.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 font-medium">Code</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Symbol</th>
                  <th className="px-4 py-3 font-medium">Decimal places</th>
                </tr>
              </thead>
              <tbody>
                {activeCurrencies.map((currency) => (
                  <tr key={currency.code} className="border-t">
                    <td className="px-4 py-3 font-medium">
                      {currency.code}
                    </td>
                    <td className="px-4 py-3">{currency.name}</td>
                    <td className="px-4 py-3">{currency.symbol}</td>
                    <td className="px-4 py-3">{currency.decimalPlaces}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border">
        <div className="border-b p-5">
          <h2 className="text-lg font-semibold">Recent exchange rates</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Listed by effective date, newest first.
          </p>
        </div>

        {loading ? (
          <p className="p-5 text-sm text-muted-foreground">
            Loading exchange rates...
          </p>
        ) : sortedRates.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No exchange rates have been recorded yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-4 py-3 font-medium">From</th>
                  <th className="px-4 py-3 font-medium">To</th>
                  <th className="px-4 py-3 font-medium">Rate</th>
                  <th className="px-4 py-3 font-medium">Effective from</th>
                  <th className="px-4 py-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {sortedRates.map((rate) => (
                  <tr key={rate.id} className="border-t">
                    <td className="px-4 py-3">
                      {rate.fromCurrencyCode}
                    </td>
                    <td className="px-4 py-3">
                      {rate.toCurrencyCode}
                    </td>
                    <td className="px-4 py-3 font-mono">{rate.rate}</td>
                    <td className="px-4 py-3">
                      {formatDate(rate.effectiveFrom)}
                    </td>
                    <td className="px-4 py-3">
                      {rate.reason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

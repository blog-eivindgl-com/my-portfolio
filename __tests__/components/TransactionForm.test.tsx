import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import TransactionForm from '@/app/stock/transactions/[ticker]/create/TransactionForm';

const mockGetAccounts = jest.fn();
const mockAddTransaction = jest.fn();
jest.mock('@/app/services/DbService', () => ({
    __esModule: true,
    default: class {
        getAccounts() { return mockGetAccounts(); }
        addTransaction(value: unknown) { return mockAddTransaction(value); }
    },
}));

let counter = 0;
const originalUUID = Object.getOwnPropertyDescriptor(crypto, 'randomUUID');
beforeAll(() => Object.defineProperty(crypto, 'randomUUID', { configurable: true, value: () => `synthetic-id-${++counter}` }));
afterAll(() => {
    if (originalUUID) Object.defineProperty(crypto, 'randomUUID', originalUUID);
    else Reflect.deleteProperty(crypto, 'randomUUID');
});
beforeEach(() => {
    // Keep the clock consistent with the global Jest/React scheduler setup.
    jest.useFakeTimers();
    mockGetAccounts.mockReset().mockResolvedValue([{ id: 'account-a', name: 'Synthetic A' }, { id: 'account-b', name: 'Synthetic B' }]);
    mockAddTransaction.mockReset().mockResolvedValue(undefined);
});

async function fillValid() {
    await screen.findByRole('option', { name: 'Synthetic B' });
    fireEvent.change(screen.getByLabelText('Account'), { target: { value: 'account-b' } });
    fireEvent.change(screen.getByLabelText('Trade date'), { target: { value: '2024-02-29' } });
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '1,25' } });
    fireEvent.change(screen.getByLabelText('Price per unit'), { target: { value: '10.50' } });
}

it('submits the selected account ID and decimal inputs, then requires an explicit new transaction', async () => {
    render(<TransactionForm ticker="SYNTH" />);
    await fillValid();
    fireEvent.submit(screen.getByRole('form'));
    await screen.findByText('Transaction saved.');
    expect(mockAddTransaction).toHaveBeenCalledWith(expect.objectContaining({ accountId: 'account-b', shares: 1.25, price: 10.5, date: Date.UTC(2024, 1, 29), brokerage: 0 }));
    expect(screen.getByRole('button', { name: 'Save transaction' })).toBeDisabled();
    fireEvent.submit(screen.getByRole('form'));
    expect(mockAddTransaction).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Create another transaction' }));
    expect(screen.getByLabelText('Quantity')).toHaveValue('');
    expect(screen.getByLabelText('Account')).toHaveValue('account-b');
});

it('blocks repeated submits synchronously while a save is pending', async () => {
    let complete!: () => void;
    mockAddTransaction.mockImplementation(() => new Promise<void>(resolve => { complete = resolve; }));
    render(<TransactionForm ticker="SYNTH" />);
    await fillValid();
    fireEvent.submit(screen.getByRole('form'));
    fireEvent.submit(screen.getByRole('form'));
    expect(mockAddTransaction).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await act(async () => { complete(); });
    await screen.findByText('Transaction saved.');
});

it('preserves fields and the save ID after storage failure so retry is safe', async () => {
    mockAddTransaction.mockRejectedValueOnce(new Error('Synthetic quota failure'));
    render(<TransactionForm ticker="SYNTH" />);
    await fillValid();
    fireEvent.submit(screen.getByRole('form'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Your entries are unchanged');
    expect(screen.getByLabelText('Quantity')).toHaveValue('1,25');
    expect(screen.getByLabelText('Trade date')).toHaveValue('2024-02-29');
    fireEvent.click(screen.getByRole('button', { name: 'Retry save' }));
    await screen.findByText('Transaction saved.');
    expect(mockAddTransaction.mock.calls[1][0]).toEqual(mockAddTransaction.mock.calls[0][0]);
});

it('shows validation errors without calling storage', async () => {
    render(<TransactionForm ticker="SYNTH" />);
    await screen.findByRole('option', { name: 'Synthetic B' });
    fireEvent.change(screen.getByLabelText('Trade date'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Price per unit'), { target: { value: 'Infinity' } });
    fireEvent.submit(screen.getByRole('form'));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Account')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Trade date')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Price per unit')).toHaveAttribute('aria-invalid', 'true');
    expect(mockAddTransaction).not.toHaveBeenCalled();
});

it('uses edited values and a new save ID when correcting a failed save', async () => {
    mockAddTransaction.mockRejectedValueOnce(new Error('Synthetic quota failure'));
    render(<TransactionForm ticker="SYNTH" />);
    await fillValid();
    fireEvent.submit(screen.getByRole('form'));
    await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '2.5' } });
    fireEvent.submit(screen.getByRole('form'));
    await screen.findByText('Transaction saved.');
    expect(mockAddTransaction.mock.calls[1][0].shares).toBe(2.5);
    expect(mockAddTransaction.mock.calls[1][0].id).not.toBe(mockAddTransaction.mock.calls[0][0].id);
});

it('handles account-load failure and explicit retry without enabling an unsafe save', async () => {
    mockGetAccounts.mockRejectedValueOnce(new Error('Synthetic read failure'));
    render(<TransactionForm ticker="SYNTH" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load accounts');
    expect(screen.getByRole('button', { name: 'Save transaction' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Reload accounts' }));
    await screen.findByRole('option', { name: 'Synthetic B' });
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});

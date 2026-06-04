import { AppointmentService } from '../services/appointmentService';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    single: jest.fn(() => Promise.resolve({ data: null, error: null })),
    then: jest.fn((cb: (v: any) => any) => Promise.resolve(cb({ data: [], error: null }))),
  };
  return {
    supabase: {
      from: jest.fn(() => chain),
      _chain: chain,
    },
  };
});

const mockChain = (supabase as any)._chain;

beforeEach(() => {
  jest.clearAllMocks();
  // Re-wire mockReturnThis so chains still work after clearAllMocks
  Object.keys(mockChain).forEach(key => {
    if (key !== 'single' && key !== 'then') {
      (mockChain[key] as jest.Mock).mockReturnValue(mockChain);
    }
  });
  (mockChain.single as jest.Mock).mockResolvedValue({ data: null, error: null });
  (mockChain.then as jest.Mock).mockImplementation((cb: (v: any) => any) =>
    Promise.resolve(cb({ data: [], error: null }))
  );
});

describe('AppointmentService.fetchAll', () => {
  it('calls from appointments with ascending date order', () => {
    AppointmentService.fetchAll();
    expect(supabase.from).toHaveBeenCalledWith('appointments');
    expect(mockChain.select).toHaveBeenCalled();
    expect(mockChain.order).toHaveBeenCalledWith('date', { ascending: true });
  });
});

describe('AppointmentService.fetchAllDesc', () => {
  it('orders by date desc and pages via range', async () => {
    const result = await AppointmentService.fetchAllDesc();
    expect(mockChain.order).toHaveBeenCalledWith('date', { ascending: false });
    expect(mockChain.range).toHaveBeenCalledWith(0, 999);
    expect(result).toEqual({ data: [], error: null });
  });

  it('keeps paging until a short page is returned', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}` }));
    (mockChain.then as jest.Mock)
      .mockImplementationOnce((cb: (v: any) => any) => Promise.resolve(cb({ data: fullPage, error: null })))
      .mockImplementationOnce((cb: (v: any) => any) => Promise.resolve(cb({ data: [{ id: 'last' }], error: null })));
    const result = await AppointmentService.fetchAllDesc();
    expect(mockChain.range).toHaveBeenCalledWith(0, 999);
    expect(mockChain.range).toHaveBeenCalledWith(1000, 1999);
    expect(result.data).toHaveLength(1001);
  });
});

describe('AppointmentService.insert', () => {
  it('calls insert and select and single', () => {
    const data = { user_id: 'u1', date: '2024-06-01', time: '10:00', status: 'confirmed' as const, program: 'individual' };
    AppointmentService.insert(data);
    expect(mockChain.insert).toHaveBeenCalledWith(data);
    expect(mockChain.select).toHaveBeenCalled();
    expect(mockChain.single).toHaveBeenCalled();
  });
});

describe('AppointmentService.updateStatus', () => {
  it('calls update with status and eq with id', () => {
    AppointmentService.updateStatus('appt-1', 'cancelled');
    expect(mockChain.update).toHaveBeenCalledWith({ status: 'cancelled' });
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'appt-1');
  });

  it('can update to confirmed', () => {
    AppointmentService.updateStatus('appt-2', 'confirmed');
    expect(mockChain.update).toHaveBeenCalledWith({ status: 'confirmed' });
  });
});

describe('AppointmentService.updateAttended', () => {
  it('calls update with attended=true', () => {
    AppointmentService.updateAttended('appt-1', true);
    expect(mockChain.update).toHaveBeenCalledWith({ attended: true });
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'appt-1');
  });

  it('calls update with attended=null', () => {
    AppointmentService.updateAttended('appt-1', null);
    expect(mockChain.update).toHaveBeenCalledWith({ attended: null });
  });
});

describe('AppointmentService.checkDailyConflict', () => {
  it('filters by user_id, date and confirmed status', () => {
    AppointmentService.checkDailyConflict('user-1', '2024-06-01');
    expect(mockChain.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mockChain.eq).toHaveBeenCalledWith('date', '2024-06-01');
    expect(mockChain.eq).toHaveBeenCalledWith('status', 'confirmed');
  });
});

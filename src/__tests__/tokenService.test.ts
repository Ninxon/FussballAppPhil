import { TokenService } from '../services/tokenService';
import { supabase } from '../lib/supabase';

jest.mock('../lib/supabase', () => {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    gt: jest.fn().mockReturnThis(),
    single: jest.fn(() => Promise.resolve({ data: null, error: null })),
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
  Object.keys(mockChain).forEach(key => {
    if (key !== 'single') {
      (mockChain[key] as jest.Mock).mockReturnValue(mockChain);
    }
  });
  (mockChain.single as jest.Mock).mockResolvedValue({ data: null, error: null });
});

describe('TokenService.fetchActive', () => {
  it('queries cancellation_tokens table', () => {
    TokenService.fetchActive('user-1');
    expect(supabase.from).toHaveBeenCalledWith('cancellation_tokens');
  });

  it('filters by player_id', () => {
    TokenService.fetchActive('user-1');
    expect(mockChain.eq).toHaveBeenCalledWith('player_id', 'user-1');
  });

  it('filters used_at IS NULL', () => {
    TokenService.fetchActive('user-1');
    expect(mockChain.is).toHaveBeenCalledWith('used_at', null);
  });

  it('filters expires_at in the future', () => {
    TokenService.fetchActive('user-1');
    expect(mockChain.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });
});

describe('TokenService.insert', () => {
  it('inserts token data and returns single', () => {
    const data = {
      player_id: 'p1',
      category: 'individual',
      expires_at: '2024-07-01T00:00:00Z',
      source_appointment_id: 'appt-1',
    };
    TokenService.insert(data);
    expect(mockChain.insert).toHaveBeenCalledWith(data);
    expect(mockChain.single).toHaveBeenCalled();
  });
});

describe('TokenService.markUsed', () => {
  it('updates used_at timestamp for token id', () => {
    TokenService.markUsed('token-1');
    expect(mockChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ used_at: expect.any(String) })
    );
    expect(mockChain.eq).toHaveBeenCalledWith('id', 'token-1');
  });
});

describe('TokenService.fetchAllActive', () => {
  it('selects player_id and category', () => {
    TokenService.fetchAllActive();
    expect(mockChain.select).toHaveBeenCalledWith('player_id, category');
  });

  it('filters unspent tokens with future expiry', () => {
    TokenService.fetchAllActive();
    expect(mockChain.is).toHaveBeenCalledWith('used_at', null);
    expect(mockChain.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
  });
});

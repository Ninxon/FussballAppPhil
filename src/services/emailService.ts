import { supabase } from '../lib/supabase';

type BookingEmailData = { name: string; date: string; time: string; program: string; location?: string | null };

async function call(fnName: string, body: BookingEmailData): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke(fnName, { body });
    if (error) console.warn(`E-Mail "${fnName}" fehlgeschlagen:`, error.message);
  } catch (e) {
    console.warn(`E-Mail "${fnName}" nicht erreichbar:`, e);
  }
}

export const EmailService = {
  sendBooking: (data: BookingEmailData) => call('send-booking-email', data),
  sendCancellation: (data: BookingEmailData) => call('send-cancellation-email', data),
};

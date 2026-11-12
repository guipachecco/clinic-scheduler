// The Mercado Pago tab and the "Conectar" button stay hidden while Mercado
// Pago does not enable OAuth for the Zemana application (ticket WCS-58328).
// The webhook and the OAuth return stay open. Turn back to true when the
// connection works.
export const MERCADO_PAGO_VISIBLE = false;

// Masks a field as the user types (CPF, phone) and keeps the caret next to
// the same digit. Backspace right after a separator ("." "-" ")" " ") removes
// the digit before it, so the punctuation never traps the caret.

function countDigits(value: string) {
  return value.replace(/\D/g, "").length;
}

export function applyMask(
  event: React.ChangeEvent<HTMLInputElement>,
  mask: (value: string) => string,
  setValue: (value: string) => void,
) {
  const input = event.target;
  let raw = input.value;
  let caret = input.selectionStart ?? raw.length;
  const inputType = (event.nativeEvent as InputEvent).inputType;
  // The value before this keystroke: the last masked value, or the default.
  const previous = input.dataset.masked ?? input.defaultValue;
  if (
    inputType === "deleteContentBackward" &&
    countDigits(raw) === countDigits(previous) &&
    caret > 0
  ) {
    const before = raw.slice(0, caret).replace(/\d(?=\D*$)/, "");
    raw = before + raw.slice(caret);
    caret = before.length;
  }
  const digitsBeforeCaret = countDigits(raw.slice(0, caret));
  const masked = mask(raw);
  input.dataset.masked = masked;
  setValue(masked);
  let position = 0;
  for (let seen = 0; position < masked.length; position++) {
    if (seen === digitsBeforeCaret) break;
    if (/\d/.test(masked[position])) seen++;
  }
  requestAnimationFrame(() => input.setSelectionRange(position, position));
}

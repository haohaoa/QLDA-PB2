import React, { useEffect, useState } from 'react';
import { formatNumber } from '../utils/numberFormat';

interface FormattedNumberInputProps {
  value: number | '';
  onValueChange: (value: number | '') => void;
  className: string;
  min?: number;
  required?: boolean;
}

export const FormattedNumberInput: React.FC<FormattedNumberInputProps> = ({
  value,
  onValueChange,
  className,
  min,
  required,
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const [draft, setDraft] = useState(value === '' ? '' : formatNumber(value));

  useEffect(() => {
    if (!isFocused) setDraft(value === '' ? '' : formatNumber(value));
  }, [isFocused, value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={isFocused ? draft : value === '' ? '' : formatNumber(value)}
      onFocus={() => {
        setDraft(value === '' ? '' : String(value));
        setIsFocused(true);
      }}
      onChange={(event) => {
        const digits = event.target.value.replace(/\D/g, '');
        const nextValue = digits === '' ? '' : Number(digits);
        event.currentTarget.setCustomValidity(
          min !== undefined && nextValue !== '' && nextValue < min
            ? `Giá trị tối thiểu là ${formatNumber(min)}.`
            : ''
        );
        setDraft(digits);
        onValueChange(nextValue);
      }}
      onBlur={() => {
        setIsFocused(false);
        setDraft(value === '' ? '' : formatNumber(value));
      }}
      className={className}
      min={min}
      required={required}
    />
  );
};
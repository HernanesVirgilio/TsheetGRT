import React, { useId } from 'react';

const CONTROL_CLASSES =
  'w-full rounded-md border border-border-input bg-surface px-3 text-sm text-text placeholder:text-text-muted ' +
  'focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted ' +
  'aria-[invalid=true]:border-danger';

interface FieldFrameProps {
  id: string;
  label: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}

const FieldFrame: React.FC<FieldFrameProps> = ({ id, label, error, hint, required, children }) => (
  <div className="space-y-1.5">
    <label htmlFor={id} className="block text-sm font-medium text-text">
      {label}
      {required && (
        <span className="text-danger" aria-hidden="true">
          {' '}
          *
        </span>
      )}
    </label>
    {children}
    {hint && !error && (
      <p id={`${id}-hint`} className="text-xs text-text-muted">
        {hint}
      </p>
    )}
    {error && (
      <p id={`${id}-error`} className="text-xs font-medium text-danger">
        {error}
      </p>
    )}
  </div>
);

function describedBy(id: string, error?: string | null, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

interface BaseFieldProps {
  label: string;
  error?: string | null;
  hint?: string;
}

type TextFieldProps = BaseFieldProps & React.InputHTMLAttributes<HTMLInputElement>;

export const TextField: React.FC<TextFieldProps> = ({ label, error, hint, id, required, className = '', ...inputProps }) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame id={fieldId} label={label} error={error} hint={hint} required={required}>
      <input
        id={fieldId}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={`h-10 ${CONTROL_CLASSES} ${className}`}
        {...inputProps}
      />
    </FieldFrame>
  );
};

type SelectFieldProps = BaseFieldProps & React.SelectHTMLAttributes<HTMLSelectElement>;

export const SelectField: React.FC<SelectFieldProps> = ({
  label,
  error,
  hint,
  id,
  required,
  className = '',
  children,
  ...selectProps
}) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame id={fieldId} label={label} error={error} hint={hint} required={required}>
      <select
        id={fieldId}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={`h-10 ${CONTROL_CLASSES} ${className}`}
        {...selectProps}
      >
        {children}
      </select>
    </FieldFrame>
  );
};

type TextAreaFieldProps = BaseFieldProps & React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextAreaField: React.FC<TextAreaFieldProps> = ({
  label,
  error,
  hint,
  id,
  required,
  className = '',
  ...textAreaProps
}) => {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame id={fieldId} label={label} error={error} hint={hint} required={required}>
      <textarea
        id={fieldId}
        required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy(fieldId, error, hint)}
        className={`py-2 ${CONTROL_CLASSES} ${className}`}
        {...textAreaProps}
      />
    </FieldFrame>
  );
};

/** Campo de pesquisa/filtro sem rótulo visível (o rótulo fica acessível via aria-label). */
export const SearchInput: React.FC<React.InputHTMLAttributes<HTMLInputElement> & { label: string }> = ({
  label,
  className = '',
  ...inputProps
}) => (
  <input
    type="search"
    aria-label={label}
    placeholder={label}
    className={`h-10 ${CONTROL_CLASSES} ${className}`}
    {...inputProps}
  />
);

export const FilterSelect: React.FC<React.SelectHTMLAttributes<HTMLSelectElement> & { label: string }> = ({
  label,
  className = '',
  children,
  ...selectProps
}) => (
  <select aria-label={label} className={`h-10 ${CONTROL_CLASSES} ${className}`} {...selectProps}>
    {children}
  </select>
);

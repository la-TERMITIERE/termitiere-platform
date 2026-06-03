import { forwardRef } from 'react'

// Liste déroulante. `options` = [{ value, label }] ou enfants <option> directs.
const Select = forwardRef(function Select({ className = '', options, children, ...props }, ref) {
  return (
    <select ref={ref} className={`input-base ${className}`} {...props}>
      {options
        ? options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))
        : children}
    </select>
  )
})

export default Select

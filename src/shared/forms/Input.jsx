import { forwardRef } from 'react'

// Champ de saisie standard (texte, nombre, date, etc.).
const Input = forwardRef(function Input({ className = '', ...props }, ref) {
  return <input ref={ref} className={`input-base ${className}`} {...props} />
})

export default Input

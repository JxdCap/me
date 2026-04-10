type FrostButtonProps = {
  label: string
  ariaLabel: string
}

export function FrostButton({ label, ariaLabel }: FrostButtonProps) {
  return (
    <button className="frost-button" type="button" aria-label={ariaLabel}>
      {label}
    </button>
  )
}

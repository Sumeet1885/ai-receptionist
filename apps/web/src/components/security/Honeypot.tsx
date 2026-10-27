interface HoneypotProps {
  name: string;
  value: string;
  onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

// Off-screen field that people never see or reach by keyboard; bots that fill every input do.
export function Honeypot(props: HoneypotProps) {
  return (
    <div aria-hidden="true" style={{ position: 'absolute', left: '-10000px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}>
      <label>
        Leave this field empty
        <input type="text" tabIndex={-1} autoComplete="off" {...props} />
      </label>
    </div>
  );
}

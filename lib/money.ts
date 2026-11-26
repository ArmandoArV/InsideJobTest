/** Credits are integer minor units; 100 minor = 1 credit. No float touches money. */
export function formatCredits(minor: number): string {
  return (minor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 });
}

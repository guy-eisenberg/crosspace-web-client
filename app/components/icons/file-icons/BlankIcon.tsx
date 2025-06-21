export default function BlankIcon({
  ...rest
}: React.SVGAttributes<SVGElement>) {
  return (
    <svg
      {...rest}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 200 240"
    >
      <path
        fill="#5B5B5B"
        d="M157.67 61.24a20.64 20.64 0 0 1-20.62-20.62V12H44.91A26.91 26.91 0 0 0 18 38.9v162.22A26.91 26.91 0 0 0 44.91 228h110.6a26.91 26.91 0 0 0 26.92-26.91V61.24z"
        opacity="0.3"
      ></path>
      <path
        fill="#5B5B5B"
        d="M182.43 61.24h-24.76a20.64 20.64 0 0 1-20.62-20.62V12z"
      ></path>
    </svg>
  );
}

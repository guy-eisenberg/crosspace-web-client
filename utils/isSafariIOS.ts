export function isSafariIOS() {
  return (
    /^((?!chrome|android).)*safari/i.test(navigator.userAgent) &&
    /iPad|iPhone|iPod/.test(navigator.userAgent)
  );
}

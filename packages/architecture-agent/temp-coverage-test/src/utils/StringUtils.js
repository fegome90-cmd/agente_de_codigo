
export function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function reverse(str) {
  return str.split('').reverse().join('');
}

export function truncate(str, length) {
  if (str.length <= length) return str;
  return str.substring(0, length) + '...';
}

export function isPalindrome(str) {
  const cleaned = str.toLowerCase().replace(/[^a-z0-9]/g, '');
  return cleaned === cleaned.split('').reverse().join('');
}

export function countWords(str) {
  return str.trim().split(/\s+/).filter(word => word.length > 0).length;
}
      
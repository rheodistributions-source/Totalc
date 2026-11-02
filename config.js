/* TCS settings.
   TCS_PUBLIC_URL = the PUBLIC address of this site, with no slash at the end.
   Every QR code the system makes will use it, so a phone that scans a sticker from outside the company
   opens a page that anyone can see. Example: window.TCS_PUBLIC_URL = "https://tcs-klb.netlify.app";
   Leave it empty ("") to use whatever address the page was opened from. */
window.TCS_PUBLIC_URL = "";

/* Old tool stickers pointed at the PIN-locked officer page. Send them to the open scan screen instead. */
(function () {
  try {
    var p = location.pathname, s = location.search;
    if (/[?&]tool=/.test(s) && !/scan\.html$/.test(p)) location.replace("/scan.html" + s);
  } catch (e) {}
})();

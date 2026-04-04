import webpush from "web-push";

const vapidKeys = webpush.generateVAPIDKeys();

console.log("Add these to your .env:\n");
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com`);

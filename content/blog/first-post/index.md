---

title: 0.1+0.2 not equal to 0.3???😕

date: "2021-08-21T23:46:37.121Z"

tags: ["DP", "recursion"]

description: Find minimum number of coins that make a given value.

---

Hey there, if you are reading this in a desktop, press ctrl + shift + i and open console and paste the below code.

```js
 0.1 + 0.2 === 0.3
```

if you are new to programming, you might be surprised by the output false and is computer arithmetic broke or is this a secret plan by illuminati to control all our computers.

Don’t worry, this is by design. we think of numbers as decimal(multiples of 10), similarly all computers process numbers in binary. So, the same way 1/3 can never be represented accurately in decimal. No fraction with divisors other than 2 can be represented exactly in binary.

In this case, binary64 0.1 is a little greater than 1/10 and 0.2 is a little greater than 1/5, so the difference add up is significant enough for the result to become 0.30000000000000004.

---

## The solution

In financial computing, fixed point is used to overcome this problem. But, this is only because of rounding to given precision(generally 2 points after decimal), Binary can never represent 0.1 or 0.2 or any fraction with denominator other than 2 accurately, the same way decimal cannot represent any fraction with denominator other than 2 and 5 accurately.

processor designers preffered to implement FPUs(Floating Point Units) because this format offers more range for the same amount of space (16, 32, 64 bits) and figured most(99.9%) of the computations will not be affected by these subtle idiosyncrasies. But most computing will be affected by a lack of range and quick arithmetic operations.

Play around by changing pricision numbers using below snippet😁✌️.

```js
Number.parseFloat(0.1).toFixed(20)
```

```js
"0.10000000000000000555"
```

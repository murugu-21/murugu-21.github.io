---
title: Coin Change Problem
date: "2021-08-09T23:46:37.121Z"
tags: ["floating-point", "javascript"]
description: The limitations of floating point math and weighing tradeoffs.
---

When I was a child, I used to run to grocery store nearby wondering how much change I should carry in order to pay the bill exactly as many shopkeepers use no change as classic excuse to push chocolates on you (effectively, increasing their sales numbers). I figured that if I carried one ₹5 coin, two ₹2 coins and one ₹1 coin I could pay any change from 1 to 10.

Coin change problem is much simpler, given a value n and a list of coin values, we have to figure out the minimum number of coins required to reach the value n. If no solution exist we can output -1.

My initial approach is that if the value is equal to one of the coins value I could return 1. It is easy to scale for larger values of n as we can subtract each coin value from n and repeat till n becomes one of the coin values. We can compare the solution generated and choose one with minimum value for (n - coin) value for each and use a global variable to select the sequence with minimum number of coins.

```js
function minCoins(coins, n) {
  if (n === 0) return 0
  let noOfCoins = -1
  for (let i = 0; i < coins.length; i++) {
    if (coins[i] <= n) {
      let noOfCoinsSub = minCoins(coins, n - coins[i])
      if (
        noOfCoinsSub !== -1 &&
        (noOfCoinsSub + 1 < noOfCoins || noOfCoins === -1)
      )
        noOfCoins = noOfCoinsSub + 1
    }
  }
  return noOfCoins
}
//example
console.log(minCoins([1, 2, 5], 12))
```

```text
3
```

The above solution uses recursion. In general, It is a good practice to avoid/optimize recursion as much as possible in our application, while it makes reading code a breeze, the call stack can become huge and result in stack overflows. We can see that minCoins([1, 2, 5], 10) is called twice once after subtracting two 1’s and again for coin 2. Like this, The same results are computed many times and this really hurts the performance of our function as n becomes large.

We can optimize our function by memoizing the answer for minCoins([1, 2, 5], 10). In fact this is a very common technique in DSA known as Dynamic Programming (DP). Basically, wherever we use recursion and a lot of the subproblems overlap, memoization can improve run time by orders of magnitude. There are two techniques tabulation and memoization within DP. We will use memoization since this will keep our function resembling the original solution with just another if condition rather than resorting to loops as in the case of tabulation.

```js
function minCoinsMemo(coins, n, dp) {
  if (n === 0) return 0
  let noOfCoins = -1
  if (dp[n]) return dp[n]
  for (let i = 0; i < coins.length; i++) {
    if (coins[i] <= n) {
      dp[n - coins[i]] = minCoinsMemo(coins, n - coins[i], dp)
      if (
        dp[n - coins[i]] !== -1 &&
        (dp[n - coins[i]] + 1 < noOfCoins || noOfCoins === -1)
      ) {
        noOfCoins = dp[n - coins[i]] + 1
      }
    }
  }
  return noOfCoins
}
//example
console.log(minCoinsMemo([1, 2, 5], 12, new Array(12)))
```

```text
3
```

We can measure the improvement using performance.measure(). I have given my results below.

```js
const { performance } = require("perf_hooks")
let coins = [1, 2, 5],
  n = 30,
  dp = new Array(n)

let t0 = performance.now()
minCoins(coins, n)
let t1 = performance.now()
console.log(t1 - t0, "ms")

let tm0 = performance.now()
minCoinsMemo(coins, n, dp)
let tm1 = performance.now()
console.log(tm1 - tm0, "ms")
```

```text
75.27449998259544 ms
0.07790002226829529 ms
```

**Geez** Magnitudes of improvement!!!

**Note:** I was asked a variant of this problem where the sequence rather than just the count of coins was needed in a recent interview. I have linked the stackoverflow question and my answer [here](https://stackoverflow.com/questions/67793004/there-are-x-participants-the-participants-are-to-be-divided-into-groups-each/68948687#68948687).

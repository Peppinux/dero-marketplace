/*
  Marketplace Smart Contract in DVM-BASIC
  Version: 0.1
  Author: Peppinux

  Built for the Dero Smart Contract build competition
*/

Function Initialize() Uint64
10  STORE("products_count", 0)
20  STORE("orders_count", 0)
30  STORE("reviews_count", 0)
40  RETURN 0
End Function

Function Deposit(value Uint64) Uint64 // This function isn't needed for the marketplace. It's only here to allow the initial setup of the SC, since SCs need to have at least 0.000000000001 DERO left inside of them to send coins without producing a error
10  printf "%d deposited" value
20  RETURN 0
End Function

// User functions ========================================================

Function SetContactInfo(contact_info String) Uint64 // contact_info will be used by buyers and sellers to communicate (i.e. provide physical address for the shipment of products). Since data stored in a SC is public, contact_info should be something anonymous such as a ProtonMail address or a Wickr username
10  STORE("USER"+SIGNER()+"_ContactInfo", contact_info)
20  printf "SUCCESS: Contact info set"
30  RETURN 0
End Function

// =======================================================================

Function CancelOrder(order_id Uint64, reason String) Uint64
10  IF EXISTS("ORDER"+order_id+"_ProductID") THEN GOTO 20
11  printf "ERROR: Order does not exist"
12  RETURN 1

20  DIM signer, buyer, seller as String
30  LET signer = SIGNER()
40  LET buyer = LOAD("ORDER"+order_id+"_Buyer")
50  LET seller = LOAD("ORDER"+order_id+"_Seller")

60  IF ADDRESS_RAW(signer) == ADDRESS_RAW(buyer) || ADDRESS_RAW(signer) == ADDRESS_RAW(seller) THEN GOTO 70
61  printf "ERROR: Only the buyer or the seller can cancel the order"
62  RETURN 1

70  IF LOAD("ORDER"+order_id+"_Error") == "NULL" THEN GOTO 80
71  printf "ERROR: Order did not go through because of an error so it cannot be canceled"
72  RETURN 1

80  DIM canceled_by, cancel_reason as String
90  LET canceled_by = LOAD("ORDER"+order_id+"_CanceledBy")
100 LET cancel_reason = LOAD("ORDER"+order_id+"_CancelReason")

110 IF canceled_by == "NULL" THEN GOTO 120
111 printf "ERROR: Order already canceled by %s" canceled_by
112 printf "Reason: %s" cancel_reason
113 RETURN 1

120 IF LOAD("ORDER"+order_id+"_FulfilledBySeller") == 0 THEN GOTO 130
121 printf "ERROR: Order already fulfilled by the seller so it cannot be canceled"
122 RETURN 1

130 STORE("ORDER"+order_id+"_CanceledBy", signer)
140 STORE("ORDER"+order_id+"_CancelReason", reason)
150 DIM product_id as Uint64
160 LET product_id = LOAD("ORDER"+order_id+"_ProductID")
  
170 IF LOAD("PRODUCT"+product_id+"_Name") == "REMOVED" THEN GOTO 190
180 STORE("PRODUCT"+product_id+"_Amount", LOAD("PRODUCT"+product_id+"_Amount") + LOAD("ORDER"+order_id+"_ProductAmount"))

190 SEND_DERO_TO_ADDRESS(buyer, LOAD("ORDER"+order_id+"_TotalCost"))
200 printf "SUCCESS: Order canceled"
210 RETURN 0
End Function

// Seller functions ======================================================

Function AddProduct(name String, description String, price Uint64, amount Uint64) Uint64
10  IF name != "" THEN GOTO 20
11  printf "ERROR: Product must have a name"
12  RETURN 1

20  IF description != "" THEN GOTO 30
21  printf "ERROR: Product must have a description"
22  RETURN 1

30  IF price >= 0 THEN GOTO 40
31  printf "ERROR: Product price cannot be less than 0"
32  RETURN 1

40  IF amount > 0 THEN GOTO 50
41  printf "ERROR: Product amount cannot be less than 1"
42  RETURN 1

50  DIM product_id as Uint64
60  LET product_id = LOAD("products_count") + 1
70  DIM seller as String
80  LET seller = SIGNER()
90  STORE("PRODUCT"+product_id+"_Name", name)
100 STORE("PRODUCT"+product_id+"_Description", description)
110 STORE("PRODUCT"+product_id+"_Price", price)
120 STORE("PRODUCT"+product_id+"_Amount", amount)
130 STORE("PRODUCT"+product_id+"_Seller", seller)
140 STORE("products_count", product_id)
150 printf "SUCCESS: Product ID %d added to the marketplace (Name: %s, Description: %s, Price: %d, Amount: %d) by seller %s" product_id name description price amount seller
160 RETURN 0
End Function

// =======================================================================

Function RemoveProduct(product_id Uint64) Uint64
10  IF ADDRESS_RAW(LOAD("PRODUCT"+product_id+"_Seller")) == ADDRESS_RAW(SIGNER()) THEN GOTO 20
11  printf "ERROR: Only sellers can remove their products from the market"
12  RETURN 1

20  STORE("PRODUCT"+product_id+"_Name", "REMOVED")
30  STORE("PRODUCT"+product_id+"_Description", "REMOVED")
40  STORE("PRODUCT"+product_id+"_Price", 0)
50  STORE("PRODUCT"+product_id+"_Amount", 0)
60  printf "SUCCESS: Product ID %d removed from the market" product_id
70  RETURN 0
End Function

// =======================================================================

Function ChangeProductAmount(product_id Uint64, new_amount Uint64) Uint64
10  IF ADDRESS_RAW(LOAD("PRODUCT"+product_id+"_Seller")) == ADDRESS_RAW(SIGNER()) THEN GOTO 20
11  printf "ERROR: Only sellers can change the amounts of their products"
12  RETURN 1

20  STORE("PRODUCT"+product_id+"_Amount", new_amount);
30  printf "SUCCESS: Amount of Product ID %d changed to %d" product_id new_amount
40  RETURN 0
End Function

// =======================================================================

Function FulfillOrder(order_id Uint64) Uint64
10  IF EXISTS("ORDER"+order_id+"_ProductID") THEN GOTO 20
11  printf "ERROR: Order does not exist"
12  RETURN 1

20  DIM seller as String
30  LET seller = LOAD("ORDER"+order_id+"_Seller")

40  IF ADDRESS_RAW(SIGNER()) == ADDRESS_RAW(seller) THEN GOTO 50
41  printf "ERROR: Only the seller can fulfill the order"
42  RETURN 1

50  IF LOAD("ORDER"+order_id+"_Error") == "NULL" THEN GOTO 60
51  printf "ERROR: Order did not go through because of an error so it cannot be fulfilled"
52  RETURN 1

60  DIM canceled_by, reason as String
70  LET canceled_by = LOAD("ORDER"+order_id+"_CanceledBy")
80  LET reason = LOAD("ORDER"+order_id+"_CancelReason")

90  IF canceled_by == "NULL" THEN GOTO 100
91  printf "ERROR: Order canceled by %s so it cannot be fulfilled" canceled_by
92  printf "Reason: %s" reason
93  RETURN 1

100 IF LOAD("ORDER"+order_id+"_FulfilledBySeller") == 0 THEN GOTO 110
101 printf "ERROR: Order already fulfilled"
102 RETURN 1

110 STORE("ORDER"+order_id+"_FulfilledBySeller", 1)
120 SEND_DERO_TO_ADDRESS(seller, LOAD("ORDER"+order_id+"_TotalCost"))
130 printf "SUCCESS: Order ID %d fulfilled" order_id
140 RETURN 0
End Function

// Buyer functions =======================================================

Function BuyProduct(value Uint64, product_id Uint64, amount Uint64) Uint64 // value should be equal to product price * amount. If not, unused coins will be sent back to the buyer address
10  DIM buyer, seller, error as String
20  LET buyer = SIGNER()
30  DIM order_id, total_cost, available_amount as Uint64
40  LET order_id = LOAD("orders_count") + 1
50  STORE("ORDER"+order_id+"_ProductID", product_id)
60  STORE("ORDER"+order_id+"_ProductAmount", amount)
70  STORE("ORDER"+order_id+"_TotalCost", 0)
80  STORE("ORDER"+order_id+"_Buyer", buyer)
90  STORE("ORDER"+order_id+"_Seller", "NULL")
100 STORE("ORDER"+order_id+"_FulfilledBySeller", 0)
110 STORE("ORDER"+order_id+"_CanceledBy", "NULL")
120 STORE("ORDER"+order_id+"_CancelReason", "NULL")
130 STORE("ORDER"+order_id+"_Error", "NULL")
140 STORE("orders_count", order_id)

150 IF EXISTS("USER"+buyer+"_ContactInfo") THEN GOTO 160 ELSE GOTO 161

160 IF LOAD("USER"+buyer+"_ContactInfo") != "" THEN GOTO 170
161 SEND_DERO_TO_ADDRESS(buyer, value)
162 LET error = "Buyer contact info not set" // Contact info must be set so that the seller can ask the buyer shipment data privately 
163 STORE("ORDER"+order_id+"_Error", error)
164 printf "ERROR: %s" error
165 RETURN 0

170 IF EXISTS("PRODUCT"+product_id+"_Amount") THEN GOTO 180
171 SEND_DERO_TO_ADDRESS(buyer, value)
172 LET error = "Product ID not valid"
173 STORE("ORDER"+order_id+"_Error", error)
174 printf "ERROR: %s" error
175 RETURN 0

180 LET seller = LOAD("PRODUCT"+product_id+"_Seller")
190 LET total_cost = LOAD("PRODUCT"+product_id+"_Price") * amount
200 STORE("ORDER"+order_id+"_Seller", seller)
210 STORE("ORDER"+order_id+"_TotalCost", total_cost)
220 LET available_amount = LOAD("PRODUCT"+product_id+"_Amount")

230 IF available_amount > 0 THEN GOTO 240
231 SEND_DERO_TO_ADDRESS(buyer, value)
232 LET error = "Product not available anymore"
233 STORE("ORDER"+order_id+"_Error", error)
234 printf "ERROR: %s" error
235 RETURN 0

240 IF available_amount >= amount THEN GOTO 250
241 SEND_DERO_TO_ADDRESS(buyer, value)
242 LET error = "Only " + available_amount + " items available"
243 STORE("ORDER"+order_id+"_Error", error)
244 printf "ERROR: %s" error
245 RETURN 0

250 IF value == total_cost THEN GOTO 280

260 IF value > total_cost THEN GOTO 270
261 SEND_DERO_TO_ADDRESS(buyer, value)
262 LET error = "Insufficient coins sent to the SC"
263 STORE("ORDER"+order_id+"_Error", error)
264 printf "ERROR: %s" error
265 RETURN 0

270 SEND_DERO_TO_ADDRESS(buyer, value - total_cost)

280 STORE("PRODUCT"+product_id+"_Amount", available_amount - amount)
290 printf "SUCCESS: #%d items of Product ID %d have been bought" amount product_id
300 RETURN 0
End Function

// =======================================================================

Function ReviewOrder(order_id Uint64, satisfied Uint64, comment String) Uint64
10  IF EXISTS("ORDER"+order_id+"_ProductID") THEN GOTO 20
11  printf "ERROR: Order does not exist"
12  RETURN 1

20  IF ADDRESS_RAW(LOAD("ORDER"+order_id+"_Buyer")) == ADDRESS_RAW(SIGNER()) THEN GOTO 30
21  printf "ERROR: Only the buyer can review the order"
22  RETURN 1

30  IF LOAD("ORDER"+order_id+"_FulfilledBySeller") == 1 THEN GOTO 40
31  print "ERROR: Cannot review order not fulfilled"
32  RETURN 1

40  IF satisfied == 0 || satisfied == 1 THEN GOTO 50
41  printf "ERROR: Satisfied must be either 0 (true) or 1 (false)"
42  RETURN 1

50  DIM review_id as Uint64
60  LET review_id = LOAD("reviews_count") + 1
70  DIM seller as String
80  LET seller = LOAD("ORDER"+order_id+"_Seller")
90  STORE("REVIEW"+review_id+"_OrderID", order_id)
100 STORE("REVIEW"+review_id+"_Seller", seller)
110 STORE("REVIEW"+review_id+"_Author", SIGNER())
120 STORE("REVIEW"+review_id+"_BuyerSatisfied", satisfied)
130 STORE("REVIEW"+review_id+"_BuyerComment", comment)
140 STORE("reviews_count", review_id)
150 STORE("ORDER"+order_id+"_ReviewID", review_id)
160 printf "SUCCESS: Order ID %d reviewd" order_id

170 IF EXISTS("USER"+seller+"_PositiveFeedback") THEN GOTO 190
180 STORE("USER"+seller+"_PositiveFeedback", 0)

190 IF EXISTS("USER"+seller+"_NegativeFeedback") THEN GOTO 210
200 STORE("USER"+seller+"_NegativeFeedback", 0)

210 IF satisfied == 0 THEN GOTO 240
220 STORE("USER"+seller+"_PositiveFeedback", LOAD("USER"+seller+"_PositiveFeedback") + 1)
230 RETURN 0

240 STORE("USER"+seller+"_NegativeFeedback", LOAD("USER"+seller+"_NegativeFeedback") + 1)
250 RETURN 0
End Function

// Error handling

const errors = {
  'ERR_NO_DAEMON_CONNECTION': 'Cannot connect to the daemon. Make sure it is running on the port you entered and web security is disabled on your browser.',
  'ERR_INVALID_SCID': 'SCID not valid.',
  'ERR_INVALID_WALLET_ADDRESS': 'Wallet address not valid. <b>DETO</b> addresses are not accepted. In order to get your <b>DERO</b> address, run your wallet in mainnet mode, display your address and copy it.',
  'ERR_PAGE_NOT_FOUND': 'Page not found.',
  'ERR_UNDEFINED': 'Something went wrong.',
  'ERR_INVALID_PAGE': 'Page not valid.',
  'ERR_NO_PRODUCTS': 'There are currently no products to show.',
  'ERR_NO_ORDERS': 'You currently have no orders.'
}

const showError = message => {
  if(message) {
    const errorPopup = document.querySelector('#error-popup')
    const closeError = document.querySelector('#close-error')
    const errorMessage = document.createElement('p')
    errorMessage.innerHTML = errors[message]
    errorPopup.appendChild(errorMessage)
    errorPopup.style.display = 'block'
    closeError.style.display = 'block'
    console.error('Error:', message)
  }
}

const hideErrors = () => {
  const errorPopup = document.querySelector('#error-popup')
  const closeError = document.querySelector('#close-error')
  errorPopup.style.display = 'none'
  closeError.style.display = 'none'
  errorPopup.innerHTML = ''
  errorPopup.appendChild(closeError)
}

// Utility functions

const deroUintToString = value => {
  let str = [...value.toString()]
  while(str.length <= 12) {
    str = ['0', ...str]
  }
  str = [...str.splice(0, str.length-12), '.', ...str.splice(str.length-12, str.length)]
  return str.join('')
}

const deroStringToUint = value => {
  let arr = parseFloat(value)
    .toFixed(12)
    .toString()
    .split('')
  arr.splice(arr.length - 13, 1)
  return parseInt(arr.join(''))
}

// Daemon communication

const querySC = async (keys = [], getBalance = false) => {
  const [ scid, daemonPort ] = [ localStorage.getItem('scid'), localStorage.getItem('daemonPort') ]

  try {
    let res = await fetch(`http://127.0.0.1:${daemonPort}/gettransactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: `{
        "txs_hashes":["${scid}"],
        "sc_keys":${JSON.stringify(keys)}
      }`
    })
    res = await res.json()

    if(res.status === 'TX NOT FOUND' || !res.txs[0].sc)
      throw 'ERR_INVALID_SCID'
      
    let result = {
      keys: res.txs[0]['sc_keys']
    }

    if(getBalance)
      result.balance = res.txs[0]['sc_balance']

    return result
  } catch(e) {
    if(e.toString().substr(0, 4) == 'ERR_')
      throw e
    else
      throw 'ERR_NO_DAEMON_CONNECTION'
  }
}

const fetchProducts = async (page) => {
  const limit = localStorage.getItem('limit')

  try {
    let res = await querySC(['products_count'])
    
    const productsCount = res.keys['products_count']
    if(productsCount < 1 || !productsCount)
      throw 'ERR_NO_PRODUCTS'

    const upperLimit = productsCount - ((page - 1) * limit)
    if(upperLimit <= 0)
      throw 'ERR_INVALID_PAGE'

    let lowerLimit = upperLimit - limit
    lowerLimit = (lowerLimit >= 0) ? lowerLimit : 0

    let products = []

    for(let i = upperLimit; i > lowerLimit; i--) {
      products.push(`PRODUCT${i}_Name`)
      products.push(`PRODUCT${i}_Description`)
      products.push(`PRODUCT${i}_Price`)
      products.push(`PRODUCT${i}_Amount`)
      products.push(`PRODUCT${i}_Seller`)
    }

    res = await querySC(products)

    let result = {
      pages: Math.ceil(productsCount / limit),
      products: []
    }

    for(let i = upperLimit; i > lowerLimit; i--) {
      result.products.push({
        id: i,
        name: res.keys[`PRODUCT${i}_Name`],
        description: res.keys[`PRODUCT${i}_Description`],
        price: res.keys[`PRODUCT${i}_Price`],
        amount: res.keys[`PRODUCT${i}_Amount`],
        seller: res.keys[`PRODUCT${i}_Seller`],
      })
    }

    return result
  } catch(e) {
    throw e
  }
}

const getLiteralFeedback = async (userAddress) => {
  try {
    let res = await querySC([`USER${userAddress}_PositiveFeedback`, `USER${userAddress}_NegativeFeedback`])

    const feedback = res.keys[`USER${userAddress}_PositiveFeedback`] - res.keys[`USER${userAddress}_NegativeFeedback`]

    if(feedback > 0)
      return 'positive'
    if(feedback < 0)
      return 'negative'
  } catch(e) {
    showError(e)
  }
}

const fetchOrders = async (page, ownerType) => { // ownerType equal to 'Buyer' or 'Seller'
  const [ limit, walletAddress ] = [ localStorage.getItem('limit'), localStorage.getItem('walletAddress') ]

  try {
    let res = await querySC(['orders_count'])

    const totalOrdersCount = res.keys['orders_count']
    if(totalOrdersCount < 1 || !totalOrdersCount)
      throw 'ERR_NO_ORDERS'

    const skippableOrders = (page - 1) * limit
    let
      ordersCount = 0,
      skippedOrdersCount = 0

    let orders = []

    let i = totalOrdersCount
    while(i >= 0 && ordersCount < limit) {
      res = await querySC([`ORDER${i}_${ownerType}`])

      if(res.keys[`ORDER${i}_${ownerType}`] === walletAddress) {
        ordersCount++

        if(skippedOrdersCount < skippableOrders) {
          skippedOrdersCount++
          continue
        }
        
        const orderRes = await querySC([
          `ORDER${i}_ProductID`,
          `ORDER${i}_ProductAmount`,
          `ORDER${i}_TotalCost`,
          `ORDER${i}_Buyer`,
          `ORDER${i}_Seller`,
          `ORDER${i}_FulfilledBySeller`,
          `ORDER${i}_CanceledBy`,
          `ORDER${i}_CancelReason`,
          `ORDER${i}_Error`,
          `ORDER${i}_ReviewID`
        ])

        const
          productid = orderRes.keys[`ORDER${i}_ProductID`],
          reviewid = orderRes.keys[`ORDER${i}_ReviewID`],
          sellerAddress = orderRes.keys[`ORDER${i}_Seller`],
          buyerAddress = orderRes.keys[`ORDER${i}_Buyer`]

        const
          productRes = await querySC([`PRODUCT${productid}_Name`]),
          reviewRes = await querySC([
            `REVIEW${reviewid}_BuyerSatisfied`,
            `REVIEW${reviewid}_BuyerComment`
          ]),
          usersRes = await querySC([`USER${sellerAddress}_ContactInfo`, `USER${buyerAddress}_ContactInfo`])
          
        orders.push({
          id: i,
          productid,
          productName: productRes.keys[`PRODUCT${productid}_Name`],
          productAmount: orderRes.keys[`ORDER${i}_ProductAmount`],
          totalCost: orderRes.keys[`ORDER${i}_TotalCost`],
          buyer: orderRes.keys[`ORDER${i}_Buyer`],
          seller: orderRes.keys[`ORDER${i}_Seller`],
          fulfilledBySeller: orderRes.keys[`ORDER${i}_FulfilledBySeller`],
          canceledBy: orderRes.keys[`ORDER${i}_CanceledBy`],
          cancelReason: orderRes.keys[`ORDER${i}_CancelReason`],
          error: orderRes.keys[`ORDER${i}_Error`],
          review: {
            buyerSatisfied: reviewRes.keys[`REVIEW${reviewid}_BuyerSatisfied`],
            comment: reviewRes.keys[`REVIEW${reviewid}_BuyerComment`]
          },
          sellerContactInfo: usersRes.keys[`USER${sellerAddress}_ContactInfo`],
          buyerContactInfo: usersRes.keys[`USER${buyerAddress}_ContactInfo`]
        })
      }
      i--
    }

    if(ordersCount == 0)
      throw 'ERR_INVALID_PAGE'

    let result = {
      pages: Math.ceil(ordersCount / limit),
      orders
    }

    return result
  } catch(e) {
    throw e
  }
}

const fetchSellerProducts = async (page) => {
  const [ limit, walletAddress ] = [ localStorage.getItem('limit'), localStorage.getItem('walletAddress') ]

  try {
    let res = await querySC(['products_count'])

    const totalProductsCount = res.keys['products_count']
    if(totalProductsCount < 1 || !totalProductsCount)
      throw 'ERR_NO_PRODUCTS'

    const skippableProducts = (page - 1) * limit
    let
      productsCount = 0,
      skippedProductsCount = 0

    let products = []

    let i = totalProductsCount
    while(i >= 0 && productsCount < limit) {
      res = await querySC([`PRODUCT${i}_Seller`])

      if(res.keys[`PRODUCT${i}_Seller`] === walletAddress) {
        productsCount++

        if(skippedProductsCount < skippableProducts) {
          skippedProductsCount++
          continue
        }
        
        res = await querySC([
          `PRODUCT${i}_Name`,
          `PRODUCT${i}_Description`,
          `PRODUCT${i}_Price`,
          `PRODUCT${i}_Amount`,
          `PRODUCT${i}_Seller`,
        ])

        products.push({
          id: i,
          name: res.keys[`PRODUCT${i}_Name`],
          description: res.keys[`PRODUCT${i}_Description`],
          price: res.keys[`PRODUCT${i}_Price`],
          amount: res.keys[`PRODUCT${i}_Amount`],
          seller: res.keys[`PRODUCT${i}_Seller`],
        })
      }

      i--
    }

    if(productsCount == 0)
      throw 'ERR_INVALID_PAGE'

    let result = {
      pages: Math.ceil(productsCount / limit),
      products
    }

    return result
  } catch(e) {
    throw e
  }
}

// On click and submission listeners

const toggleDropdown = () => {
  const dropdownMenu = document.querySelector('#dropdown-menu')
  dropdownMenu.style.display = getComputedStyle(dropdownMenu, null).display == 'none' ? 'flex' : 'none'
}

const onConnection = e => {
  e.preventDefault()

  const [ scid, daemonPort, walletPort, walletAddress ] = [ e.target.scid.value, e.target.daemon.value, e.target.wallet.value, e.target.address.value ]

  if(walletAddress.substr(0, 4).toUpperCase() !== "DERO") {
    showError('ERR_INVALID_WALLET_ADDRESS')
    return
  }

  localStorage.setItem('scid', scid)
  localStorage.setItem('daemonPort', daemonPort)
  localStorage.setItem('walletPort', walletPort)
  localStorage.setItem('walletAddress', walletAddress)

  querySC()
    .then(() => loadPage('Market', { page: 1 }))
    .catch(err => {
      localStorage.clear()
      showError(err)
    })
}

const onDisconnection = () => {
  localStorage.clear()
  location.reload()
}

const onPageClick = e => {
  loadPage(e.target.dataset.page, e.target.dataset.params ? JSON.parse(e.target.dataset.params) : undefined)
  document.querySelector('#dropdown-menu').style.display = 'none'
}

const applyLimit = e => {
  e.preventDefault()

  localStorage.setItem('limit', e.target.limit.value)

  loadPage(e.target.dataset.page, { page: 1 })
}

const prevPage = e => {
  const pageName = e.target.dataset.pagename
  let page = parseInt(document.querySelector(`#${pageName}Page .navigation .current-page-number`).innerHTML)
  if(--page >= 1)
    loadPage(pageName, { page })
}

const nextPage = e => {
  const pageName = e.target.dataset.pagename
  let page = parseInt(document.querySelector(`#${pageName}Page .navigation .current-page-number`).innerHTML)
  loadPage(pageName, { page: ++page })
}

const buyProduct = (e, id, price) => {
  e.preventDefault()

  const amount = e.target.amount.value

  const commandSection = document.querySelector(`#MarketPage .products .product .command-section[data-id="${id}"]`)
  const code = commandSection.querySelector('code')

  code.innerHTML = `curl -X POST http://127.0.0.1:${localStorage.getItem('walletPort')}/json_rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"0","method":"transfer_split","params":{"mixin":5,"get_tx_key":true,"sc_tx":{"entrypoint":"BuyProduct","scid":"${localStorage.getItem('scid')}","value":${price * amount},"params":{"product_id":"${id}","amount":"${amount}"}}}}'`
  commandSection.style.setProperty('display', 'block', 'important')
}

const setContactInfo = e => {
  e.preventDefault()

  const commandSection = document.querySelector('#SetContactInfoPage .page-body .command-section')
  const code = commandSection.querySelector('code')

  code.innerHTML = `curl -X POST http://127.0.0.1:${localStorage.getItem('walletPort')}/json_rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"0","method":"transfer_split","params":{"mixin":5,"get_tx_key":true,"sc_tx":{"entrypoint":"SetContactInfo","scid":"${localStorage.getItem('scid')}","params":{"contact_info":"${e.target['contact-info'].value}"}}}}'`
  commandSection.style.setProperty('display', 'block', 'important')
}

const addProduct = e => {
  e.preventDefault()

  const commandSection = document.querySelector('#AddProductPage .page-body .command-section')
  const code = commandSection.querySelector('code')
  
  code.innerHTML = `curl -X POST http://127.0.0.1:${localStorage.getItem('walletPort')}/json_rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"0","method":"transfer_split","params":{"mixin":5,"get_tx_key":true,"sc_tx":{"entrypoint":"AddProduct","scid":"${localStorage.getItem('scid')}","params":{"name":"${e.target.name.value}","description":"${e.target.description.value}","price":"${deroStringToUint(e.target.price.value)}","amount":"${e.target.amount.value}"}}}}'`
  commandSection.style.setProperty('display', 'block', 'important')
}

const showReviewOrderForm = orderid => {
  const formContainer = document.querySelector(`#BuyerOrdersPage .orders .order[data-orderid="${orderid}"] .form-container`)
  formContainer.style.display = 'block'
  formContainer.querySelector('.review-form').style.display = 'block'
}

const showCancelOrderForm = (orderid, pageSrc) => {
  const formContainer = document.querySelector(`#${pageSrc}Page .orders .order[data-orderid="${orderid}"] .form-container`)
  formContainer.style.display = 'block'
  formContainer.querySelector('.cancel-form').style.display = 'block'
  formContainer.querySelector('.command-section').style.display = 'none'
}

const reviewOrder = (e, orderid) => {
  e.preventDefault()

  const commandSection = document.querySelector(`#BuyerOrdersPage .orders .order[data-orderid="${orderid}"] .form-container .command-section`)
  const code = commandSection.querySelector('code')

  code.innerHTML = `curl -X POST http://127.0.0.1:${localStorage.getItem('walletPort')}/json_rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"0","method":"transfer_split","params":{"mixin":5,"get_tx_key":true,"sc_tx":{"entrypoint":"ReviewOrder","scid":"${localStorage.getItem('scid')}","params":{"order_id":"${orderid}","satisfied":"${(e.target.satisfied.value === 'yes') ? 1 : 0}","comment":"${e.target.comment.value ? e.target.comment.value : ''}"}}}}'`
  commandSection.style.setProperty('display', 'block', 'important')
}

const cancelOrder = (e, orderid, pageSrc) => {
  e.preventDefault()
  
  const commandSection = document.querySelector(`#${pageSrc}Page .orders .order[data-orderid="${orderid}"] .form-container .command-section`)
  const code = commandSection.querySelector('code')

  code.innerHTML = `curl -X POST http://127.0.0.1:${localStorage.getItem('walletPort')}/json_rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"0","method":"transfer_split","params":{"mixin":5,"get_tx_key":true,"sc_tx":{"entrypoint":"CancelOrder","scid":"${localStorage.getItem('scid')}","params":{"order_id":"${orderid}","reason":"${e.target.reason.value ? e.target.reason.value : ''}"}}}}'`
  commandSection.style.setProperty('display', 'block', 'important')
}

const fulfillOrder = (orderid) => {
  const formContainer = document.querySelector(`#SellerOrdersPage .orders .order[data-orderid="${orderid}"] .form-container`)
  const commandSection = formContainer.querySelector('.command-section')
  const code = commandSection.querySelector('code')

  code.innerHTML = `curl -X POST http://127.0.0.1:${localStorage.getItem('walletPort')}/json_rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"0","method":"transfer_split","params":{"mixin":5,"get_tx_key":true,"sc_tx":{"entrypoint":"FulfillOrder","scid":"${localStorage.getItem('scid')}","params":{"order_id":"${orderid}"}}}}'`
  commandSection.style.setProperty('display', 'block', 'important')
  formContainer.querySelector('form').style.display = 'none'
  formContainer.style.display = 'block'
}

const showChangeAmountForm = productid => {
  const formContainer = document.querySelector(`#SellerProductsPage .products .product[data-productid="${productid}"] .form-container`)
  formContainer.querySelector('.command-section').style.display = 'none'
  formContainer.style.display = 'block'
  formContainer.querySelector('.change-amount-form').style.display = 'block'
}

const changeProductAmount = (e, productid) => {
  e.preventDefault()

  const commandSection = document.querySelector(`#SellerProductsPage .products .product[data-productid="${productid}"] .form-container .command-section`)
  const code = commandSection.querySelector('code')

  code.innerHTML = `curl -X POST http://127.0.0.1:${localStorage.getItem('walletPort')}/json_rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"0","method":"transfer_split","params":{"mixin":5,"get_tx_key":true,"sc_tx":{"entrypoint":"ChangeProductAmount","scid":"${localStorage.getItem('scid')}","params":{"product_id":"${productid}","new_amount":"${e.target['new-amount'].value}"}}}}'`
  commandSection.style.setProperty('display', 'block', 'important')
}

const removeProduct = (productid) => {
  const formContainer = document.querySelector(`#SellerProductsPage .products .product[data-productid="${productid}"] .form-container`)
  const commandSection = formContainer.querySelector('.command-section')
  const code = commandSection.querySelector('code')

  code.innerHTML = `curl -X POST http://127.0.0.1:${localStorage.getItem('walletPort')}/json_rpc -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":"0","method":"transfer_split","params":{"mixin":5,"get_tx_key":true,"sc_tx":{"entrypoint":"RemoveProduct","scid":"${localStorage.getItem('scid')}","params":{"product_id":"${productid}"}}}}'`
  commandSection.style.setProperty('display', 'block', 'important')
  formContainer.querySelector('form').style.display = 'none'
  formContainer.style.display = 'block'
}

// Pages handler

const loadPage = async (name, params) => {
  hideErrors()

  const currentPage = document.querySelector('.current-page')
  if(currentPage)
    currentPage.classList.remove('current-page')

  const loading = document.querySelector('#loading')
  loading.style.display = 'block'

  const header = document.querySelector('header')
  
  if(name !== 'Connection') {
    document.body.style.display = 'block'
    
    // Header initialization
    const scidLink = document.querySelector('#scid-link')
    scidLink.setAttribute('href', `http://pool.dero.io:8080/tx/${localStorage.getItem('scid')}`)
    scidLink.innerHTML = localStorage.getItem('scid')

    header.style.display = 'flex'
  } else {
    document.body.style.display = 'block'
    header.style.display = 'none'
  }

  switch(name) {
    case 'Connection': {
      // Connection setup

      const defaultValues = {
        scid: localStorage.getItem('scid') || '096d2403eeb2a7853545b8cda3d6583e57af99a60613cdfd30b8d8291050cf12',
        daemonPort: localStorage.getItem('daemonPort') || 30306,
        walletPort: localStorage.getItem('walletPort') || 30309,
        walletAddress: localStorage.getItem('walletAddress') || '',
        limit: localStorage.getItem('limit') || 10
      }

      const connectionForm = document.querySelector('#connection-form')

      connectionForm.scid.value = defaultValues.scid
      connectionForm.scid.placeholder = `${defaultValues.scid} (default)`
      connectionForm.daemon.value = defaultValues.daemonPort
      connectionForm.daemon.placeholder = `${defaultValues.daemonPort} (default)`
      connectionForm.wallet.value = defaultValues.walletPort
      connectionForm.wallet.placeholder = `${defaultValues.walletPort} (default)`
      connectionForm.address.value = defaultValues.walletAddress
      
      localStorage.setItem('limit', defaultValues.limit)

      break
    }

    case 'Market': {
      const { page } = params

      const limitInput = document.querySelector('#MarketPage .limit-input')
      limitInput.value = localStorage.getItem('limit')

      fetchProducts(page)
        .then(async res => {
          let productsList = ''

          // Market population
          for(const product of res.products) {
            const literalFeedback = await getLiteralFeedback(product.seller)

            productsList += `
              <div class='product'>
                <div class='row'>
                  <div class='left'>
                    <span class='id'>ID #${product.id}</span> <span class='name'>${product.name}</span>
                  </div>
                  <div class='price'>${deroUintToString(product.price)} <span class='ticker'>DERO</span></div>
                </div>
                <div class='row'>
                  <div class='left'>
                    <div class='description'>${product.description}</div>
                  </div>
                  <div class='amount'><span class='available-amount ${(parseInt(product.amount) < 1) ? "no-available-amount" : ""}'>${product.amount}</span> available</div>
                </div>
                <div class='row'>
                  <div class='left'>
                    <div class='seller'>Sold by <span class='seller-address'>${product.seller}</span> <span class='thumb' data-feedback=${literalFeedback}></span></div>
                  </div>
                  ${(parseInt(product.amount) > 0) ? `
                    <form class='pure-form' onsubmit='buyProduct(event, ${product.id}, ${product.price});'>
                      <fieldset>
                        <input type='number' name='amount' value=1 min=1 max=${product.amount}>
                  
                        <button type='submit' class='button-success pure-button'>Buy</button>
                      </fieldset>
                    </form></div>
                    <div class='row command-section' data-id=${product.id}>
                      <p>Execute this command to buy this product: <code></code></p>
                      <p>Make sure you <a data-page='SetContactInfo' onclick='onPageClick(event);'>set your contact info</a> before buying.</p>
                    </div>
                  ` : "</div>"}
              </div>
            `
          }

          document.querySelector('#MarketPage .products').innerHTML = productsList

          // Pagination setting
          document.querySelector('#MarketPage .navigation .current-page-number').innerHTML = page
          document.querySelector('#MarketPage .navigation .pages-count').innerHTML = res.pages
          document.querySelector('#MarketPage .navigation .arrow.prev').style.visibility = (page == 1) ? 'hidden' : 'visible'
          document.querySelector('#MarketPage .navigation .arrow.next').style.visibility = 'visible'
        })
        .catch(e => {
          if(e == 'ERR_NO_PRODUCTS')
            document.querySelector('#MarketPage .navigation .arrow.prev').style.visibility = 'hidden'
          document.querySelector('#MarketPage .navigation .arrow.next').style.visibility = 'hidden'

          showError(e)
        })
      break
    }

    case 'BuyerOrders': {
      const { page } = params

      const limitInput = document.querySelector('#BuyerOrdersPage .limit-input')
      limitInput.value = localStorage.getItem('limit')

      document.querySelector('#BuyerOrdersPage .address .dero-address').innerHTML = localStorage.getItem('walletAddress')

      fetchOrders(page, 'Buyer')
        .then(async res => {
          let ordersList = ''

          // Orders population
          for(const order of res.orders) {
            const literalFeedback = await getLiteralFeedback(order.seller)
            
            ordersList += `
              <div class='order' data-orderid=${order.id}>
                <div class='row'>
                  <div class='left'>
                    <span class='orderid'>ORDER ID <span class='orderid-content'>#${order.id}</span></span> <span class='product-amount'>${order.productAmount}x</span> <span class='product-name'>${order.productName}</span> <span class='productid'>ID #${order.productid}</span>
                  </div>
                  <div class='total-cost'>${deroUintToString(order.totalCost)} <span class='ticker'>DERO</span></div>
                </div>
                <div class='row'>
                  <div class='descriptor seller'>Sold by: <span class='seller-address'>${order.seller}</span> <span class='thumb' data-feedback=${literalFeedback}></span></div>
                </div>
                <div class='row'>
                  <div class='descriptor seller-contact-info'>Seller contact info: <span class='content seller-contact-info-content'>${order.sellerContactInfo}</span></div>
                </div>
                <div class='row'>
                  <div class='left'>
                    <div class='descriptor fulfilled'>Fulfilled by seller: <span class='fulfilled-content' data-fulfilled=${order.fulfilledBySeller == "1" ? 'yes' : 'no'}></span></div>
                  </div>
                  ${order.error !== 'NULL' || order.review.buyerSatisfied !== "" ? '' : (order.fulfilledBySeller == "1" ? `<button class='pure-button button-success' onclick='showReviewOrderForm(${order.id});'>Review</button>` : ((order.canceledBy !== 'NULL') ? '' : `<button class='pure-button button-error' onclick='showCancelOrderForm(${order.id}, "BuyerOrders");'>Cancel</button>`))}
                </div>
                <div class='row form-container'>
                  <div>
                    <form class='pure-form review-form' onsubmit='reviewOrder(event, ${order.id});'>
                      <fieldset>
                        Were you satisfied?
                        <label for='yes' class='pure-radio'>
                          <input type='radio' name='satisfied' value='yes' checked>
                          Yes
                        </label>
                      
                        <label for='no' class='pure-radio'>
                          <input type='radio' name='satisfied' value='no'>
                          No
                        </label>
                        <br>
                        <div class='pure-control-group'>
                          <label for='comment'>Comment:</label>
                          <input type='text' name='comment'></input>
                        </div>
      
                        <button type='submit' class='pure-button pure-button-primary'>Submit</button>
                      </fieldset>
                    </form>
                    <form class='pure-form cancel-form' onsubmit='cancelOrder(event, ${order.id}, "BuyerOrders");'>
                      <fieldset>
                        <div class='pure-control-group'>
                          <label for='comment'>Reason:</label>
                          <input type='text' name='reason'></input>
                        </div>
          
                        <button type='submit' class='pure-button button-error'>Submit</button>
                      </fieldset>
                    </form>
                    <div class='command-section'>
                      <p>Execute this command to submit: <code></code></p>
                    </div>
                  </div>
                </div>
                ${order.review.buyerSatisfied !== '' ? `
                  <div class='row'>
                    <div class='descriptor review'>Review: <span class='content review-content'><span class='thumb' data-feedback='${order.review.buyerSatisfied == "1" ? 'positive' : 'negative'}'></span>  ${order.review.comment}</span></div>
                  </div>
                ` : ''}
                ${order.canceledBy !== 'NULL' ? `
                  <div class='row'>
                    <div class='descriptor canceled-by'>Canceled by: <span class='content canceled-by-content'>${order.canceledBy === order.seller ? 'Seller' : (order.canceledBy === order.buyer ? 'Buyer' : order.canceledBy)}</span></div>
                  </div>
                ` : ''}
                ${order.canceledBy !== 'NULL' ? `
                  <div class='row'>
                    <div class='descriptor reason'>Reason: <span class='content reason-content'>${(order.cancelReason !== 'NULL') ? order.cancelReason : ''}</span></div>
                  </div>
                ` : ''}
                ${order.error !== 'NULL' ? `
                  <div class='row'>
                  <div class='descriptor error'>Error: <span class='content error-content'>${order.error}</span></div>
                  </div>
                ` : ''}
              </div>
            `
          }

          document.querySelector('#BuyerOrdersPage .orders').innerHTML = ordersList

          // Pagination setting
          document.querySelector('#BuyerOrdersPage .navigation .current-page-number').innerHTML = page
          document.querySelector('#BuyerOrdersPage .navigation .pages-count').innerHTML = res.pages
          document.querySelector('#BuyerOrdersPage .navigation .arrow.prev').style.visibility = (page == 1) ? 'hidden' : 'visible'
          document.querySelector('#BuyerOrdersPage .navigation .arrow.next').style.visibility = 'visible'
        })
        .catch(e => {
          if(e == 'ERR_NO_ORDERS')
            document.querySelector('#BuyerOrdersPage .navigation .arrow.prev').style.visibility = 'hidden'
          document.querySelector('#BuyerOrdersPage .navigation .arrow.next').style.visibility = 'hidden'

          showError(e)
        })
      break
    }

    case 'SetContactInfo': {
      document.querySelector('#SetContactInfoPage .address .dero-address').innerHTML = localStorage.getItem('walletAddress')

      querySC([`USER${localStorage.getItem('walletAddress')}_ContactInfo`])
        .then(res => {
          document.querySelector('#SetContactInfoPage form input').value = res.keys[`USER${localStorage.getItem('walletAddress')}_ContactInfo`] || ''
        })
        .catch(() => {})
      break
    }

    case 'AddProduct':
      break

    case 'SellerOrders': {
      const { page } = params

      const limitInput = document.querySelector('#SellerOrdersPage .limit-input')
      limitInput.value = localStorage.getItem('limit')

      document.querySelector('#SellerOrdersPage .address .dero-address').innerHTML = localStorage.getItem('walletAddress')

      fetchOrders(page, 'Seller')
        .then(res => {
          let ordersList = ''
          
          // Orders population
          for(const order of res.orders) {
            ordersList += `
              <div class='order' data-orderid=${order.id}>
                <div class='row'>
                  <div class='left'>
                    <span class='orderid'>ORDER ID <span class='orderid-content'>#${order.id}</span></span> <span class='product-amount'>${order.productAmount}x</span> <span class='product-name'>${order.productName}</span> <span class='productid'>ID #${order.productid}</span>
                  </div>
                  <div class='total-cost'>${deroUintToString(order.totalCost)} <span class='ticker'>DERO</span></div>
                </div>
                <div class='row'>
                  <div class='descriptor buyer'>Bought by: <span class='buyer-address'>${order.buyer}</span></div>
                </div>
                <div class='row'>
                  <div class='descriptor buyer-contact-info'>Buyer contact info: <span class='content buyer-contact-info-content'>${order.buyerContactInfo}</span></div>
                </div>
                <div class='row'>
                  <div class='left'>
                    <div class='descriptor fulfilled'>Fulfilled by seller: <span class='fulfilled-content' data-fulfilled=${order.fulfilledBySeller == "1" ? 'yes' : 'no'}></span></div>
                  </div>
                  ${(order.error !== 'NULL' || order.canceledBy !== 'NULL' || order.fulfilledBySeller == "1") ? '' : `
                    <div>
                      <button class='pure-button button-success' onclick='fulfillOrder(${order.id});'>Fulfill</button>
                      <button class='pure-button button-error' onclick='showCancelOrderForm(${order.id}, "SellerOrders");'>Cancel</button>
                    </div>
                  `}
                </div>
                <div class='row form-container'>
                  <div>
                    <form class='pure-form cancel-form' onsubmit='cancelOrder(event, ${order.id}, "SellerOrders");'>
                      <fieldset>
                        <div class='pure-control-group'>
                          <label for='comment'>Reason:</label>
                          <input type='text' name='reason'></input>
                        </div>
          
                        <button type='submit' class='pure-button button-error'>Submit</button>
                      </fieldset>
                    </form>
                    <div class='command-section'>
                      <p>Execute this command to submit: <code></code></p>
                    </div>
                  </div>
                </div>
                ${order.review.buyerSatisfied !== '' ? `
                  <div class='row'>
                    <div class='descriptor review'>Review: <span class='content review-content'><span class='thumb' data-feedback='${order.review.buyerSatisfied == "1" ? 'positive' : 'negative'}'></span>  ${order.review.comment}</span></div>
                  </div>
                ` : ''}
                ${order.canceledBy !== 'NULL' ? `
                  <div class='row'>
                    <div class='descriptor canceled-by'>Canceled by: <span class='content canceled-by-content'>${order.canceledBy === order.seller ? 'Seller' : (order.canceledBy === order.buyer ? 'Buyer' : order.canceledBy)}</span></div>
                  </div>
                ` : ''}
                ${order.canceledBy !== 'NULL' ? `
                  <div class='row'>
                    <div class='descriptor reason'>Reason: <span class='content reason-content'>${(order.cancelReason !== 'NULL') ? order.cancelReason : ''}</span></div>
                  </div>
                ` : ''}
                ${order.error !== 'NULL' ? `
                  <div class='row'>
                  <div class='descriptor error'>Error: <span class='content error-content'>${order.error}</span></div>
                  </div>
                ` : ''}
              </div>
            `
          }

          document.querySelector('#SellerOrdersPage .orders').innerHTML = ordersList

          // Pagination setting
          document.querySelector('#SellerOrdersPage .navigation .current-page-number').innerHTML = page
          document.querySelector('#SellerOrdersPage .navigation .pages-count').innerHTML = res.pages
          document.querySelector('#SellerOrdersPage .navigation .arrow.prev').style.visibility = (page == 1) ? 'hidden' : 'visible'
          document.querySelector('#SellerOrdersPage .navigation .arrow.next').style.visibility = 'visible'
        })
        .catch(e => {
          if(e == 'ERR_NO_ORDERS')
            document.querySelector('#SellerOrdersPage .navigation .arrow.prev').style.visibility = 'hidden'
          document.querySelector('#SellerOrdersPage .navigation .arrow.next').style.visibility = 'hidden'

          showError(e)
        })
      break
    }

    case 'SellerProducts': {
      const { page } = params

      const limitInput = document.querySelector('#SellerProductsPage .limit-input')
      limitInput.value = localStorage.getItem('limit')

      document.querySelector('#SellerProductsPage .address .dero-address').innerHTML = localStorage.getItem('walletAddress')

      fetchSellerProducts(page)
        .then(res => {
          let productsList = ''

          for(const product of res.products) {
            productsList += `
              <div class='product' data-productid=${product.id}>
                <div class='row'>
                  <div class='left'>
                    <span class='id'>#${product.id}</span> <span class='name'>${product.name}</span>  
                  </div>
                  <div class='price'>${deroUintToString(product.price)} <span class='ticker'>DERO</span></div>
                </div>
                <div class='row'>
                  <div class='left'>
                    <div class='description'>${product.description}</div>
                  </div>
                  <button class='pure-button button-error' onclick='removeProduct(${product.id});'>Remove product</button>
                </div>
                <div class='row'>
                  <div class='left'>
                    <div class='amount'>
                      <span class='amount-content ${parseInt(product.amount) < 1 ? 'no-available-amount' : ''}'>${product.amount}</span> available
                    </div>
                  </div>
                  <button class='pure-button button-secondary' onclick='showChangeAmountForm(${product.id});'>Change amount</button>
                </div>
                <div class='row'>
                  <div class='form-container'>
                    <form class='pure-form change-amount-form' onsubmit='changeProductAmount(event, ${product.id});'>
                      <fieldset>
                        <div class='pure-control-group'>
                          <label for='new-amount'>New amount:</label>
                          <input type='number' name='new-amount' required min=0></input>
                        </div>
          
                        <button type='submit' class='pure-button button-success'>Submit</button>
                      </fieldset>
                    </form>
                    <div class='command-section'>
                      <p>Execute this command: <code></code></p>
                    </div>
                  </div>
                </div>
              </div>
            `
          }
          
          document.querySelector('#SellerProductsPage .products').innerHTML = productsList

          // Pagination setting
          document.querySelector('#SellerProductsPage .navigation .current-page-number').innerHTML = page
          document.querySelector('#SellerProductsPage .navigation .pages-count').innerHTML = res.pages
          document.querySelector('#SellerProductsPage .navigation .arrow.prev').style.visibility = (page == 1) ? 'hidden' : 'visible'
          document.querySelector('#SellerProductsPage .navigation .arrow.next').style.visibility = 'visible'
        })
        .catch(e => {
          if(e == 'ERR_NO_PRODUCTS')
            document.querySelector('#SellerProductsPage .navigation .arrow.prev').style.visibility = 'hidden'
          document.querySelector('#SellerProductsPage .navigation .arrow.next').style.visibility = 'hidden'

          showError(e)
        })
      break
    }

    default:
      showError('ERR_PAGE_NOT_FOUND')
  }

  // Hide loading message
  loading.style.display = 'none'

  // Show page
  document.querySelector(`#${name}Page`).classList.add('current-page')
}

// On load

querySC()
  .then(() => loadPage('Market', { page: 1 }))
  .catch(() => loadPage('Connection'))

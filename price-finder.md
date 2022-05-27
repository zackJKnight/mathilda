get text, but only that text which is a valid price, 

find position and style

categorize by 'signal'

- boldness 
- how high on the page
- font size
- context words

Rules for the price finder:
depth first tree search on all elements and then each inner text of the element. 
so you can find where the cents and dollar signs are not stored in the same element.

does the classname have price, cost, dollar, amount, pay or other related words? (consider word to vec)

strikethrough - a negative signal. this is not the price, but perhaps the original price.


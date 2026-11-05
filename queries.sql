SELECT * FROM Customer;

SELECT
    c.Customer_ID,
    c.Customer_Name,
    a.Account_ID,
    a.Account_Amount
FROM Customer c
JOIN Account a ON c.Customer_ID = a.Customer_ID;

SELECT
    c.Customer_Name,
    t.Transaction_ID,
    t.Transaction_Type,
    t.Amount,
    t.Date
FROM Customer c
JOIN Account a ON c.Customer_ID = a.Customer_ID
JOIN Transactions t ON a.Account_ID = t.Account_ID
WHERE c.Customer_ID = 1;

SELECT
    c.Customer_Name,
    s.Staff_Name
FROM Customer c
JOIN Staff s ON c.Staff_ID = s.Staff_ID;

UPDATE Customer
SET Customer_Address = 'Pimpri Chinchwad'
WHERE Customer_ID = 1;

SELECT
    c.Customer_Name,
    a.Account_Amount
FROM Customer c
JOIN Account a ON c.Customer_ID = a.Customer_ID
WHERE a.Account_Amount > 40000;

SELECT
    s.Staff_Name,
    COUNT(c.Customer_ID) AS Total_Customers
FROM Staff s
LEFT JOIN Customer c
    ON s.Staff_ID = c.Staff_ID
GROUP BY s.Staff_ID, s.Staff_Name;